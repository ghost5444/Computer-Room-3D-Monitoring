import { createStore } from 'vuex'
import { fetchRealTimeData } from '@/utils/sdk'
import { mapFactors } from '@/utils/realtimeMap'
import { fetchUpsData, mapBattery, mapUpsHost } from '@/utils/upsAdapter'
import { devices } from '@/utils/deviceData'

// 机房设备总数，以及「全部正常」的默认统计（异常/告警完全以实时数据回传为准）
const DEVICE_TOTAL = devices.length
const INITIAL_STATS = { total: DEVICE_TOTAL, normal: DEVICE_TOTAL, warning: 0, danger: 0 }

let realtimeTimer = null
let realtimeActive = false

export default createStore({
  state: {
    selectedDevice: null,
    selectedServer: null,
    // 实时告警：初始为空，完全由 SDK 实时数据回传（danger 级因子）写入
    alerts: [],
    stats: { ...INITIAL_STATS },
    // 实时数据（来自 SDK）
    realtime: {
      connected: false,
      loading: false,
      error: '',
      lastUpdate: '',
      liveInfo: {}, // 各设备 id 的实时字段
      liveStatus: {}, // 各设备 id 的实时状态 normal/warning/danger
      upsOnline: false, // UPS HTTP 适配器（电池/输入/输出）是否在线
      version: 0 // 每次成功拉取自增，驱动 3D 状态同步
    }
  },
  getters: {
    selectedDevice: state => state.selectedDevice,
    selectedServer: state => state.selectedServer,
    alerts: state => state.alerts,
    // 机房状态总览统计：以实际设备清单为基础，叠加实时回传状态（liveStatus）实时统计
    stats: (state) => {
      const liveStatus = (state.realtime && state.realtime.liveStatus) || {}
      let normal = 0, warning = 0, danger = 0
      devices.forEach(d => {
        const st = liveStatus[d.id] || d.status || 'normal'
        if (st === 'danger') danger++
        else if (st === 'warning') warning++
        else normal++
      })
      return { total: devices.length, normal, warning, danger }
    },
    realtime: state => state.realtime
  },
  mutations: {
    SET_SELECTED_DEVICE(state, payload) {
      state.selectedDevice = payload.device
      state.selectedServer = payload.server || null
    },
    REMOVE_ALERT(state, id) {
      state.alerts = state.alerts.filter(a => a.id !== id)
    },
    // 用实时数据重算出的告警列表整体替换，保证告警中心与实时回传一致
    SET_ALERTS(state, list) {
      state.alerts = list
    },
    UPDATE_STATS(state, stats) {
      state.stats = { ...state.stats, ...stats }
    },
    SET_REALTIME(state, payload) {
      state.realtime = {
        ...state.realtime,
        ...payload,
        version: state.realtime.version + 1
      }
    }
  },
  actions: {
    selectDevice({ commit }, payload) {
      commit('SET_SELECTED_DEVICE', payload)
    },
    clearDevice({ commit }) {
      commit('SET_SELECTED_DEVICE', { device: null, server: null })
    },
    // 拉取一次实时数据并完成映射
    async fetchRealtime({ commit }) {
      commit('SET_REALTIME', { loading: true, error: '' })
      try {
        const factors = await fetchRealTimeData()
        const { liveInfo, liveStatus, alarms } = mapFactors(factors)
        let finalAlarms = alarms
        let upsOnline = false

        // 并行接入 UPS HTTP 适配器（电池/输入/输出实时数据）。
        // 以该适配器作为 UPS 的权威数据源：它提供真实值时覆盖 SDK 中 UPS 通道的
        // OffLine 空值（避免把“SDK 未监控 UPS”误判为故障）；它不可用时，UPS 按
        // “无实时数据”处理（normal），同样不误报。
        try {
          const ups = await fetchUpsData()
          if (ups && ups.online && ups.data) {
            upsOnline = true
            const batt = ups.data.battery || {}
            const inp = ups.data.input || {}
            const outp = ups.data.output || {}
            const byp = ups.data.bypass || {}

            // 将「电池信息」与「输入/输出/旁路信息」合并为一份完整的 UPS 实时数据，
            // 同时写入 UPS主机 与 UPS电池柜，使二者展示完全一致（电池信息已集成进主机）。
            const battMapped = Object.keys(batt).length ? mapBattery(batt) : {}
            const hostMapped = (Object.keys(inp).length || Object.keys(outp).length)
              ? mapUpsHost(inp, outp, batt, byp)
              : {}
            const upsCombined = {
              ...battMapped,
              ...hostMapped,
              detail: { ...(battMapped.detail || {}), ...(hostMapped.detail || {}) }
            }
            if (Object.keys(upsCombined).length) {
              liveInfo['ups-battery'] = Object.assign(liveInfo['ups-battery'] || {}, upsCombined)
              liveInfo['ups-host'] = Object.assign(liveInfo['ups-host'] || {}, upsCombined)
            }

            // 合并判定 UPS 整体状态（电池与主机任一异常即故障），主机与电池柜同步
            const battPresent = Object.keys(batt).length > 0
            const hostPresent = Object.keys(inp).length > 0 || Object.keys(outp).length > 0
            const battOk = !battPresent || (batt['电池状态'] || '').includes('正常')
            const hostState = inp['输入状态'] || outp['输出状态'] || ''
            const hostOk = !hostPresent || hostState.includes('正常') || hostState.includes('供电')
            const upsOk = battOk && hostOk
            liveStatus['ups-battery'] = upsOk ? 'normal' : 'danger'
            liveStatus['ups-host'] = upsOk ? 'normal' : 'danger'

            // 告警去重：清掉 SDK 对 UPS 两设备的独立告警，统一为一条 UPS 系统告警
            finalAlarms = finalAlarms.filter(a => a.device !== 'UPS主机' && a.device !== 'UPS电池柜')
            if (!upsOk) {
              const problems = []
              if (!battOk) problems.push(`电池${batt['电池状态'] || '异常'}`)
              if (!hostOk) problems.push(`UPS${hostState || '异常'}`)
              finalAlarms.push({ device: 'UPS主机', msg: problems.join('；'), level: 'danger' })
            }
          } else {
            // 适配器未返回有效数据：UPS 不计入故障
            liveStatus['ups-battery'] = 'normal'
            liveStatus['ups-host'] = 'normal'
            finalAlarms = finalAlarms.filter(a => a.device !== 'UPS主机' && a.device !== 'UPS电池柜')
          }
        } catch (upsErr) {
          liveStatus['ups-battery'] = 'normal'
          liveStatus['ups-host'] = 'normal'
          finalAlarms = finalAlarms.filter(a => a.device !== 'UPS主机' && a.device !== 'UPS电池柜')
          upsOnline = false
        }

        commit('SET_REALTIME', {
          loading: false,
          connected: true,
          error: '',
          lastUpdate: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          liveInfo,
          liveStatus,
          upsOnline
        })
        // 将实时告警（按设备+消息生成稳定 id）整体同步到告警中心：
        // 实时回传有则显示，恢复则自动消失；级别由 mapFactors / 适配器给出（danger/warning）。
        const alertList = finalAlarms.map((a) => {
          const message = `${a.device}：${a.msg}`
          return {
            id: `${a.device}__${a.msg}`,
            level: a.level || 'danger',
            message,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false })
          }
        })
        commit('SET_ALERTS', alertList)
      } catch (e) {
        commit('SET_REALTIME', {
          loading: false,
          connected: false,
          error: e && e.message ? e.message : '请求失败',
          upsOnline: false
        })
      }
    },
    // 启动定时轮询（默认 15s）。使用自调度 setTimeout 而非 setInterval，
    // 避免多通道拉取耗时较长时与下一次轮询重叠导致频繁 1004。
    startRealtime({ dispatch }, interval = 15000) {
      if (realtimeActive) return
      realtimeActive = true
      const tick = async () => {
        if (!realtimeActive) return
        try { await dispatch('fetchRealtime') } catch (e) { /* 由 action 内部已置错误态 */ }
        if (realtimeActive) realtimeTimer = setTimeout(tick, interval)
      }
      tick()
    },
    // 停止轮询
    stopRealtime() {
      realtimeActive = false
      if (realtimeTimer) {
        clearTimeout(realtimeTimer)
        realtimeTimer = null
      }
    }
  }
})
