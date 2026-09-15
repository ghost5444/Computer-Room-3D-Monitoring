import axios from 'axios'

// SDK 基础路径：开发环境通过 vite proxy 的 /sdk 代理到内网服务器，规避 CORS。
// 如需直连生产环境，可改为 'http://10.0.80.32/sdk'。
const BASE_URL = '/sdk'
const LOGIN_URL = `${BASE_URL}/UserManage/Login`
const DATA_URL = `${BASE_URL}/FactorManage/GetRealTimeData`

// 该服务器把不同设备的数据分散在多个通道：
//   0 -> 海信精密空调(AC)
//   1 -> 市电检测
//   2 -> 机房温度/机房湿度/4-3-RK烟感/人体检测/水浸检测
//   3 -> UPS(市电状态/各相电压/负载/频率/电池组电压/容量/续航/内部温度)
// 单次 channelNo:0 仅返回空调因子，因此必须逐通道拉取再合并。
const CHANNELS = [0, 1, 2]
const HOST_ADDR = 15501336
const CHANNEL_SPACING = 2600 // 通道间节流，规避 1004「频繁操作」
const RETRY_BACKOFF = 2200 // 命中 1004 后的退避时间

let accessToken = null
// 每个通道最近一次成功返回的因子，用于在限频时兜底，避免界面数据“闪空”
const channelCache = {}

// 兼容接口大小写不一致：成功用 code(小写)、限频用 Code(大写)
const isOk = (b) => b && (b.code === 1000 || b.Code === 1000)
const isBusy = (b) => b && (b.Code === 1004 || b.code === 1004)
const getCode = (b) => (b && (b.code !== undefined ? b.code : b.Code))
const getMsg = (b) => (b && (b.message !== undefined ? b.message : b.Message)) || '请求失败'
// 兼容接口返回的数据包形状：
//   - 成功时 d.data 可能是「数组」也可能是「以数字字符串为键的对象」({ '0':..., '1':... })
//   - 限频/失败时 d.Data 也可能出现
// 统一抽成因子数组。
const getData = (b) => {
  const d = b && (b.data !== undefined ? b.data : b.Data)
  if (!d) return null
  if (Array.isArray(d)) return d
  if (typeof d === 'object') return Object.values(d)
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 登录：POST 获取 accessToken（兼容 data/Data 两种返回包裹）
export async function login() {
  const resp = await axios.post(LOGIN_URL, { LoginName: 'master', UserPwd: 'master' })
  const body = resp.data
  const payload = body && (body.data !== undefined ? body.data : body.Data)
  if (payload && payload.accessToken) {
    accessToken = payload.accessToken
  } else {
    throw new Error(getMsg(body) || '登录失败')
  }
  return accessToken
}

// 拉取单个通道，带 1004 退避重试；token 失效时自动重新登录后重试；
// 全部失败则用该通道缓存兜底，保证界面不丢数据。
async function fetchOneChannel(channel, retry = 3) {
  const reqBody = { hostAddr: HOST_ADDR, channelNo: channel }
  for (let i = 0; i <= retry; i++) {
    let resp
    try {
      resp = await axios.get(DATA_URL, {
        params: { ...reqBody },
        data: { ...reqBody },
        headers: { token: accessToken },
        validateStatus: () => true
      })
    } catch (e) {
      if (i < retry) { await sleep(1500); continue }
      return channelCache[channel] || []
    }
    const body = resp.data
    if (isOk(body)) {
      const arr = getData(body) || []
      channelCache[channel] = arr
      return arr
    }
    if (isBusy(body)) {
      await sleep(RETRY_BACKOFF)
      continue
    }
    // 其它错误（多为 token 失效）：重新登录后重试该通道
    if (i < retry) {
      accessToken = null
      try { await login() } catch (_) {}
      await sleep(800)
      continue
    }
    return channelCache[channel] || []
  }
  return channelCache[channel] || []
}

// 合并所有通道因子，按 FactorName 去重（优先保留有有效值的那条）
function mergeChannels() {
  const byName = {}
  for (const ch of CHANNELS) {
    const arr = channelCache[ch] || []
    for (const f of arr) {
      const n = f.FactorName
      if (!n) continue
      if (!byName[n] || (byName[n].Value === '' && f.Value !== '')) byName[n] = f
    }
  }
  return Object.values(byName)
}

// 获取实时数据：逐通道拉取并合并，规避单次 channelNo:0 数据不全的问题。
export async function fetchRealTimeData() {
  if (!accessToken) await login()

  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      for (const ch of CHANNELS) {
        await fetchOneChannel(ch)
        await sleep(CHANNEL_SPACING)
      }
      const merged = mergeChannels()
      if (merged.length === 0) throw new Error('未获取到任何实时数据')
      return merged
    } catch (e) {
      lastErr = e
      accessToken = null
      try { await login() } catch (_) {}
    }
  }
  throw lastErr || new Error('获取实时数据失败')
}
