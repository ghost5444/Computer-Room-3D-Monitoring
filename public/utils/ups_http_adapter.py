#!/usr/bin/env python3
"""UPS 网页信息适配脚本（KSTAR 科士达 Web/SNMP 卡）。

功能：登录 UPS 的 Web 管理界面，打开状态页面（默认 /list1_3.html），
用无头浏览器渲染页面（让 JS 把实时数据写入页面），抓取
「输入信息 / 输出信息 / 旁路信息 / 电池信息」四个板块，整理成 JSON。

为什么用无头浏览器：
    list1_3.html 是动态页面——所有数值由 js/list1_3.js 通过 AJAX 填充到
    空的 <p id="..."> 容器里，静态 HTML 没有值，所以必须渲染执行 JS 才能取到。

配置（环境变量，均带默认值）：
    UPS_URL        UPS 网页地址，默认 http://10.0.80.30
    UPS_USER       登录账号，默认 admin
    UPS_PASSWORD   登录密码，默认 admin
    STATUS_PATH    状态页面路径，默认 /list1_3.html
    POLL_SECONDS   轮询间隔（秒），默认 15
    LISTEN_HOST    本地监听地址，默认 0.0.0.0
    LISTEN_PORT    本地监听端口，默认 17099
    HEADLESS       是否无头（默认 1；设 0 可看到浏览器窗口，便于调试）

依赖：
    pip install playwright
    playwright install chromium

用法：
    python ups_http_adapter.py            # 启动轮询服务，监听 17099，/api/ups 返回 JSON
    python ups_http_adapter.py --once     # 仅抓取一次并打印 JSON 后退出（调试用）
"""
import json
import os
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPS_URL = os.environ.get("UPS_URL", "http://10.0.80.30").rstrip("/")
UPS_USER = os.environ.get("UPS_USER", "admin")
UPS_PASSWORD = os.environ.get("UPS_PASSWORD", "admin")
STATUS_PATH = os.environ.get("STATUS_PATH", "/list1_3.html")
POLL_SECONDS = max(10, int(os.environ.get("POLL_SECONDS", "15")))
LISTEN_HOST = os.environ.get("LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "17099"))
# HEADLESS 必须是布尔值(bool)。Playwright 的 chromium.launch(headless=...) 只接受 bool，
# 若写成整数 1 会抛 "headless: expected boolean, got number"，导致适配器直接启动失败、拉不到 UPS 数据。
# 默认无头(True)；环境变量 HEADLESS=0 可显示浏览器窗口便于调试。
HEADLESS = os.environ.get("HEADLESS", "1") != "0"

# 四个目标板块 -> 页面上的容器 div id（由 list1_3.html 结构确定）
SECTION_MAP = {
    "input": "contentFloor3_1",   # 输入信息
    "output": "contentFloor3_2",  # 输出信息
    "battery": "contentFloor3_3", # 电池信息
    "bypass": "contentFloor3_4",  # 旁路信息
}

# 在浏览器内执行：遍历每个板块容器，提取「标签(p[id$=Des]) -> 数值(下一兄弟 p)」
EXTRACT_JS = r"""
(args) => {
    const sections = args.sections;
    const result = {};
    for (const [key, id] of Object.entries(sections)) {
        const root = document.getElementById(id);
        const obj = {};
        let labelCount = 0;
        if (root) {
            const labels = root.querySelectorAll('p[id$="Des"]');
            labels.forEach((lp) => {
                const label = (lp.textContent || "").trim().replace(/[：:]\s*$/, "");
                let vp = lp.nextElementSibling;
                if (!vp || vp.tagName !== "P") {
                    const valId = lp.id.replace("Des", "");
                    vp = document.getElementById(valId);
                }
                const val = vp ? (vp.textContent || "").trim() : "";
                if (!label) return;
                labelCount += 1;
                // 同一标签在多个协议子块里重复出现（如电池板块的 温度：/电池电压：）。
                // 按 key 去重并【优先保留非空值】：先填后空不覆盖，先空后非空则更新。
                const cur = obj[label];
                if (cur === undefined || (cur === "" && val !== "")) {
                    obj[label] = val;
                }
            });
        }
        const filled = Object.fromEntries(
            Object.entries(obj).filter(([, v]) => v !== "")
        );
        result[key] = filled;
        // 把诊断信息挂到结果里（以特殊 key 返回，调用方可按需读取）
        result["__diag__" + key] = {labelCount, filledCount: Object.keys(filled).length};
    }
    return result;
}
"""


class UpsClient:
    def __init__(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise RuntimeError(
                "缺少 playwright 依赖，请先执行：\n"
                "  pip install playwright\n"
                "  playwright install chromium"
            )
        self.pw = sync_playwright().start()
        # http_credentials 可自动处理 HTTP Basic 认证
        # 沙箱/容器环境下 chromium 渲染进程易因共享内存受限崩溃，加 --disable-dev-shm-usage 等参数稳定
        ctx = self.pw.chromium.launch(
            headless=HEADLESS,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        ).new_context(
            http_credentials={"username": UPS_USER, "password": UPS_PASSWORD}
            if UPS_USER
            else None
        )
        self.page = ctx.new_page()
        self.logged_in = False

    def _goto(self, url, timeout=20000):
        """导航到 URL，并容忍 ERR_ABORTED。

        这类 UPS 网页卡在未登录访问状态页时，常通过 302 重定向或页面内
        meta-refresh / JS 跳转到登录页，会中断首次导航并抛出 ERR_ABORTED。
        此时忽略错误，继续处理已经加载出来的页面（通常就是登录页）。
        """
        try:
            self.page.goto(url, wait_until="commit", timeout=timeout)
        except Exception as exc:
            msg = str(exc)
            if "ERR_ABORTED" in msg:
                print(f"[info] 导航被中断(ERR_ABORTED)，继续处理已加载页面: {url}",
                      file=sys.stderr)
            elif "commit" in msg and ("wait_until" in msg or "Unknown" in msg):
                # 旧版本 Playwright 不支持 wait_until='commit'，退回 domcontentloaded
                try:
                    self.page.goto(url, wait_until="domcontentloaded", timeout=timeout)
                except Exception as exc2:
                    if "ERR_ABORTED" in str(exc2):
                        print(f"[info] 导航被中断(ERR_ABORTED)，继续: {url}",
                              file=sys.stderr)
                    else:
                        raise
            else:
                raise
        self.page.wait_for_timeout(1500)

    def _maybe_form_login(self):
        """若页面出现登录表单，则尝试填写并提交（应对非 Basic 的网页登录）。

        科士达网页卡登录页通常用 jsencrypt/crypto-js 在前端对密码加密后再提交，
        因此这里只填明文，让页面自身的提交逻辑去加密，通常可正常工作。
        """
        try:
            pwd = self.page.query_selector('input[type="password"]')
            if not pwd:
                return  # 无密码框：已处于登录态，或并非表单登录
            print(f"[info] 检测到登录页（{self.page.url}），尝试表单登录",
                  file=sys.stderr)
            # 账号框：尝试多种常见选择器
            for sel in (
                'input[name="username"]', 'input[name="user"]',
                'input[name="account"]', 'input[name="loginName"]',
                'input[type="text"]', 'input[type="email"]',
            ):
                field = self.page.query_selector(sel)
                if field:
                    field.fill(UPS_USER)
                    break
            pwd.fill(UPS_PASSWORD)
            # 登录按钮：submit 按钮或含“登录/Login”字样的元素
            btn = self.page.query_selector(
                'button[type="submit"], input[type="submit"], '
                'button:has-text("登录"), button:has-text("Login"), '
                'a:has-text("登录"), input[type="button"]'
            )
            if btn:
                btn.click()
            else:
                self.page.keyboard.press("Enter")
            self.page.wait_for_timeout(2500)
            self.logged_in = True
        except Exception as exc:  # 登录失败不应直接中断，后续流程会暴露问题
            print(f"[warn] form login attempt failed: {exc}", file=sys.stderr)

    def _load_all_tabs(self):
        """依次激活每个子标签（输入/输出/电池/旁路），触发其惰性数据加载。

        这类网页卡（KSTAR list1_3）只在子标签被点击（nav3ItemClick）时才
        刷新/填充对应板块的数值；默认仅“输入信息”是激活态，因此电池、旁路
        等从未被激活的板块数值始终为空。这里直接调用页面内的 nav3ItemClick
        函数逐一激活，比 page.click 更稳（不依赖元素可见/可点）。
        数值填充后保留在 DOM 中，最终统一抽取。
        """
        # 一次性的存在性检查：若设备未加载 list1_3.js，nav3ItemClick 不存在，需告警
        has_fn = self.page.evaluate(
            "typeof nav3ItemClick === 'function'"
        )
        if not has_fn:
            print(
                "[warn] 页面未定义 nav3ItemClick（list1_3.js 可能未加载），"
                "将无法触发惰性板块的数据加载。",
                file=sys.stderr,
            )

        for tab_id in ("navFloor3_1", "navFloor3_2", "navFloor3_3", "navFloor3_4"):
            try:
                self.page.evaluate(
                    "(id) => {"
                    "  const el = document.getElementById(id);"
                    "  if (el && typeof nav3ItemClick === 'function') {"
                    "    nav3ItemClick(el);"
                    "  }"
                    "}",
                    tab_id,
                )
                # 等该板块的数据刷新完成（设备刷新多为 ~3-5s 周期）
                self.page.wait_for_timeout(5000)
            except Exception as exc:
                print(f"[warn] 激活标签 {tab_id} 失败: {exc}", file=sys.stderr)

    def collect(self):
        url = f"{UPS_URL}{STATUS_PATH}"
        self._goto(url)
        self._maybe_form_login()
        # 登录后重新进入状态页，等待初始加载
        self._goto(url)
        self.page.wait_for_timeout(3000)
        # 依次激活各子标签，触发电池/旁路等惰性板块的数据加载
        self._load_all_tabs()
        self.page.wait_for_timeout(2000)
        data = self.page.evaluate(EXTRACT_JS, {"sections": SECTION_MAP})

        # 诊断：若某板块找到标签却取不到值，给出针对性提示
        for key in ("input", "output", "bypass", "battery"):
            diag = data.get("__diag__" + key, {})
            if diag.get("labelCount", 0) > 0 and diag.get("filledCount", 0) == 0:
                print(
                    f"[warn] 板块 {key}：页面找到 {diag['labelCount']} 个指标标签，"
                    f"但数值全为空——该板块数据可能未加载（刷新慢或标签未激活）。",
                    file=sys.stderr,
                )
        # 整体为空的诊断
        if not any(data.get(k) for k in ("input", "output", "bypass", "battery")):
            print(
                f"[warn] 未取到任何数据（当前页面: {self.page.url}）。\n"
                f"        排查：① 确认登录是否成功（页面是否仍为登录页）；\n"
                f"        ② 若登录页字段不同，把页面 HTML 发我调整选择器；\n"
                f"        ③ 观察浏览器窗口里状态页是否真的显示了数值。",
                file=sys.stderr,
            )

        # 剔除诊断字段，仅返回四个板块的业务数据
        return {
            "input": data.get("input", {}),
            "output": data.get("output", {}),
            "bypass": data.get("bypass", {}),
            "battery": data.get("battery", {}),
            "online": True,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }

    def close(self):
        try:
            self.pw.stop()
        except Exception:
            pass


state_lock = threading.Lock()
state = {
    "online": False,
    "updatedAt": None,
    "error": "waiting for first collection",
    "data": None,
}

# 采集模式：常驻后台轮询（collector_loop），结果写入下面的 state，HTTP 接口直接返回。


def collector_loop():
    client = None
    try:
        while True:
            # 浏览器实例为空（首次启动或上次已失效）时，重建一个全新无头浏览器
            if client is None:
                try:
                    client = UpsClient()
                except Exception as exc:
                    new_state = {
                        "online": False,
                        "updatedAt": datetime.now(timezone.utc).isoformat(),
                        "error": f"启动浏览器失败: {exc}",
                        "data": None,
                    }
                    with state_lock:
                        state.update(new_state)
                    time.sleep(POLL_SECONDS)
                    continue

            try:
                data = client.collect()
                new_state = {
                    "online": True,
                    "updatedAt": data["updatedAt"],
                    "error": None,
                    "data": data,
                }
            except Exception as exc:
                # 浏览器可能被关闭/崩溃，关闭旧实例并置空，下一轮自动重建
                try:
                    client.close()
                except Exception:
                    pass
                client = None
                new_state = {
                    "online": False,
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                    "error": str(exc),
                    "data": None,
                }
            with state_lock:
                state.update(new_state)
            time.sleep(POLL_SECONDS)
    finally:
        if client:
            client.close()


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path not in ("/", "/health", "/api/ups"):
            self.send_error(404)
            return
        with state_lock:
            payload = dict(state)
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(200 if payload.get("online", False) else 503)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    if "--once" in sys.argv:
        # 调试模式：仅抓取一次并打印 JSON
        client = UpsClient()
        try:
            print(json.dumps(client.collect(), ensure_ascii=False, indent=2))
        finally:
            client.close()
    else:
        # 常驻后台轮询：collector_loop 周期性抓取 UPS 数据写入 state；
        # 采集放守护线程（self-heal：浏览器崩溃会自动重建），HTTP 服务放主线程。
        threading.Thread(target=collector_loop, daemon=True).start()
        ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler).serve_forever()
