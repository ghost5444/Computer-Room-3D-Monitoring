// 将 SDK 返回的实时因子，映射到三维图中各部件的展示数据。
// 以 FactorName（中文名称）为匹配键——比 plugin 字符串更稳定、可读。
//
// 映射结果：
//   liveInfo   : 各设备 id 的实时字段（覆盖/补充到 DeviceDetail 对应部件）
//   liveStatus : 各设备 id 的实时运行状态（normal / warning / danger），用于 3D 状态箭头 + 总览统计
//   alarms     : 当前处于告警/故障态的因子列表（含 level），用于告警中心
//
// 真实接口说明：
//   - 因子包 d.data 既可能是数组，也可能是 { '0':..., '1':... } 对象（见 sdk.js getData）。
//   - 因子 State 取值为 OnLine / OffLine；告警信号以 AlarmMsg 非空为准。
//   - 接口未暴露独立的「Warning」级别，故 warning 仅在 State==='Warning' 时出现；
//     其余异常（OffLine / AlarmMsg 非空）一律视为 danger（故障/告警）。

// 取因子的有效原始值：优先 Value，其次 DisplayMsg；空则返回 ''
function factorVal(f) {
  if (!f) return ''
  if (f.Value !== null && f.Value !== undefined && f.Value !== '') return String(f.Value)
  if (f.DisplayMsg !== null && f.DisplayMsg !== undefined && f.DisplayMsg !== '') return String(f.DisplayMsg)
  return ''
}

// 带单位的格式化：值为空时返回 undefined（交由静态值兜底，不在界面显示裸单位）
function withUnit(f, unit) {
  const v = factorVal(f)
  return v ? `${v}${unit}` : undefined
}

// 因子运行等级：normal / warning / danger
const SEV = { normal: 0, warning: 1, danger: 2 }
function worse(a, b) { return (SEV[a] || 0) >= (SEV[b] || 0) ? a : b }

function factorLevel(f) {
  if (!f) return 'normal'
  const s = String(f.State || '').trim().toLowerCase()
  if (s === 'offline' || s === 'alarm' || s === 'fault') return 'danger'
  if (s === 'warning') return 'warning'
  if (f.AlarmMsg && String(f.AlarmMsg).trim() !== '') return 'danger'
  return 'normal'
}

export function mapFactors(factors) {
  // factors 可能是数组或对象，统一转数组
  const list = Array.isArray(factors) ? factors : Object.values(factors || {})
  const byName = {}
  list.forEach(f => { byName[f.FactorName] = f })

  const liveInfo = {}
  const liveStatus = {}
  const alarms = []
  const devLevel = {}

  // 向某设备 id 合并实时字段（只覆盖已提供的键）
  const set = (id, patch) => { liveInfo[id] = Object.assign(liveInfo[id] || {}, patch) }
  // 累计某设备当前最严重等级
  const mark = (id, lvl) => { devLevel[id] = worse(devLevel[id] || 'normal', lvl) }
  // 取告警文案：优先 AlarmMsg，否则回退文案
  const alarmText = (f, fallback) => (f && String(f.AlarmMsg || '').trim()) || fallback

  // ---------- 温湿度传感器 ----------
  {
    const t = byName['机房温度']
    const h = byName['机房湿度']
    set('sensor-th01', {
      temperature: withUnit(t, '℃'),
      humidity: withUnit(h, '%RH')
    })
    mark('sensor-th01', worse(factorLevel(t), factorLevel(h)))
  }

  // ---------- 烟感传感器 ----------
  {
    const f = byName['4-3-RK烟感']
    const lvl = factorLevel(f)
    if (lvl !== 'normal') {
      set('sensor-smoke01', {
        status: `${lvl === 'danger' ? '告警' : '预警'}：${alarmText(f, '检测到烟雾')}`
      })
      mark('sensor-smoke01', lvl)
      alarms.push({ device: '烟感传感器', msg: alarmText(f, '检测到烟雾'), level: lvl })
    } else {
      set('sensor-smoke01', { status: '正常（无烟雾）' })
      mark('sensor-smoke01', 'normal')
    }
  }

  // ---------- 门禁 ----------
  {
    const body = byName['人体检测']
    const water = byName['水浸检测']
    const bLvl = factorLevel(body)
    const wLvl = factorLevel(water)
    set('door', {
      bodyDetect: bLvl !== 'normal' ? '检测到人员' : '无人员通过',
      waterDetect: wLvl !== 'normal' ? '告警：检测到积水' : '正常（无积水）',
      waterLevel: wLvl !== 'normal' ? '> 0 mm' : '0 mm'
    })
    if (bLvl !== 'normal') {
      mark('door', bLvl)
      alarms.push({ device: '门禁', msg: '检测到人员', level: bLvl })
    }
    if (wLvl !== 'normal') {
      mark('door', wLvl)
      alarms.push({ device: '门禁', msg: '检测到积水', level: wLvl })
    }
    if (bLvl === 'normal' && wLvl === 'normal') mark('door', 'normal')
  }

  // ---------- 配电柜（市电检测） ----------
  {
    const mains = byName['市电检测']
    const lvl = factorLevel(mains)
    set('rack-power', {
      mainsStatus: factorVal(mains) || '正常',
      mainsState: lvl === 'normal' ? '正常' : (lvl === 'danger' ? '故障' : '预警')
    })
    mark('rack-power', lvl)
  }

  // ---------- 精密空调 ----------
  {
    const mode = byName['机组模式设定']
    const cool = byName['制冷温度设定值']
    const fan = byName['内风机设定风速']
    const run = byName['当前运行状态']
    const returnAir = byName['回风温度数据']
    const unitPower = byName['机组开关设定']
    const filter = byName['滤网状态']
    const compHigh = byName['压缩机高压状态']
    const compLow = byName['压缩机低压状态']
    const compDis = byName['压缩机排气状态']
    const fanPro = byName['内风机保护状态']
    const fanOver = byName['内风机过载状态']

    set('ac', {
      mode: factorVal(mode),
      coolingSetpoint: withUnit(cool, '℃'),
      fanSpeed: factorVal(fan),
      runStatus: factorVal(run),
      detail: {
        filterStatus: factorVal(filter),
        compHighPressure: factorVal(compHigh),
        compLowPressure: factorVal(compLow),
        compDischargeTemp: factorVal(compDis),
        fanProtection: factorVal(fanPro),
        fanOverload: factorVal(fanOver),
        unitPowerSetting: factorVal(unitPower),
        returnAirTemp: withUnit(returnAir, '℃')
      }
    })

    const acFactors = [filter, compHigh, compLow, compDis, fanPro, fanOver, run, unitPower, mode]
    let lvl = 'normal'
    acFactors.forEach(f => { lvl = worse(lvl, factorLevel(f)) })
    if (lvl !== 'normal') {
      mark('ac', lvl)
      alarms.push({ device: '精密空调', msg: `空调异常（${lvl === 'danger' ? '故障' : '预警'}）`, level: lvl })
    } else {
      mark('ac', 'normal')
    }
  }

  // ---------- UPS 主机 ----------
  {
    const mains = byName['UPS市电状态']
    const inA = byName['UPS输入A相电压']
    const inB = byName['UPS输入B相电压']
    const inC = byName['UPS输入C相电压']
    const out = byName['UPS输出电压']
    const freq = byName['UPS输入频率']
    const load = byName['UPS输出负载']
    const inTemp = byName['UPS内部温度']

    set('ups-host', {
      mainsStatus: factorVal(mains),
      outputLoad: withUnit(load, '%'),
      internalTemp: withUnit(inTemp, '℃'),
      detail: {
        inputVoltageA: withUnit(inA, 'V'),
        inputVoltageB: withUnit(inB, 'V'),
        inputVoltageC: withUnit(inC, 'V'),
        inputFrequency: withUnit(freq, 'Hz'),
        outputVoltage: withUnit(out, 'V'),
        batteryVoltage: undefined
      }
    })

    const upsFactors = [mains, inA, inB, inC, out, freq, load]
    let lvl = 'normal'
    upsFactors.forEach(f => { lvl = worse(lvl, factorLevel(f)) })
    if (lvl !== 'normal') {
      mark('ups-host', lvl)
      alarms.push({ device: 'UPS主机', msg: `UPS异常（${lvl === 'danger' ? '故障' : '预警'}）`, level: lvl })
    } else {
      mark('ups-host', 'normal')
    }
  }

  // ---------- UPS 电池柜 ----------
  {
    const battV = byName['电池组电压']
    const battCap = byName['电池容量']
    const battRun = byName['电池续航']

    set('ups-battery', {
      batteryCapacity: factorVal(battCap),
      batteryRuntime: withUnit(battRun, ' 分钟'),
      detail: {
        batteryVoltage: withUnit(battV, 'V')
      }
    })

    const battFactors = [battV, battCap, battRun]
    let lvl = 'normal'
    battFactors.forEach(f => { lvl = worse(lvl, factorLevel(f)) })
    if (lvl !== 'normal') {
      mark('ups-battery', lvl)
      alarms.push({ device: 'UPS电池柜', msg: `电池组异常（${lvl === 'danger' ? '故障' : '预警'}）`, level: lvl })
    } else {
      mark('ups-battery', 'normal')
    }
  }

  // 把累计等级写入 liveStatus（仅对本次有实时数据的设备生效；其余设备由 store 回退为 normal）
  Object.keys(devLevel).forEach(id => { liveStatus[id] = devLevel[id] })

  return { liveInfo, liveStatus, alarms }
}
