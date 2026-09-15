import axios from 'axios'

// UPS HTTP 适配器接口（由 public/utils/ups_http_adapter.py 提供，本地监听 17099）。
// 经 vite 代理：/ups/api/ups -> http://127.0.0.1:17099/api/ups
const UPS_API = '/ups/api/ups'

// 去掉 undefined/null/空串 的键，避免用空值覆盖静态数据
function clean(o) {
  const r = {}
  for (const k in o) {
    const v = o[k]
    if (v !== undefined && v !== null && v !== '') r[k] = v
  }
  return r
}

// 把适配器返回的「电池信息」板块（中文标签->值）映射到 UPS 电池柜的实时字段。
// 同时保留 batteryRaw 原始键值，供详情页完整展示（不依赖具体标签名）。
export function mapBattery(raw = {}) {
  const detail = { batteryVoltage: raw['电池电压'] }
  const top = {
    batteryStatus: raw['电池状态'], // 正常 / 告警 ...
    batteryCapacity: raw['电池容量'], // 100%
    batteryRuntime: raw['电池剩余时间'], // 155分
    batteryTemp: raw['电池温度'], // 33.0℃
    detail,
    batteryRaw: raw
  }
  return clean(top)
}

// 把「输入信息 / 输出信息 / 旁路信息」映射到 UPS 主机实时字段。
export function mapUpsHost(inp = {}, outp = {}, batt = {}, byp = {}) {
  const detail = {
    inputVoltageA: inp['R 相输入电压'],
    inputVoltageB: inp['S 相输入电压'],
    inputVoltageC: inp['T 相输入电压'],
    inputFrequency: inp['输入频率'],
    outputVoltage: outp['R 相输出电压'] || outp['电压'],
    batteryVoltage: batt['电池电压']
  }
  const load = outp['负载率']
  const top = {
    mainsStatus: inp['输入状态'] || outp['输出状态'],
    outputLoad: load != null && /^\d+(\.\d+)?$/.test(String(load)) ? `${load}%` : load,
    internalTemp: batt['电池温度'],
    detail,
    upsRaw: { input: inp, output: outp, bypass: byp }
  }
  return clean(top)
}

// 拉取 UPS 适配器数据；任何失败都返回 null（不影响其余设备的实时数据）。
export async function fetchUpsData() {
  try {
    const r = await axios.get(UPS_API, { timeout: 15000 })
    const body = r.data
    if (body && body.online && body.data) return body
    return null
  } catch (e) {
    return null
  }
}
