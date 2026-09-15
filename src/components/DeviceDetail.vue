<template>
  <el-drawer
    v-model="visible"
    title="设备详情"
    size="360px"
    :with-header="true"
    :before-close="handleClose"
  >
    <div v-if="device" class="detail-content">
      <div class="device-icon">
        <el-icon :size="48" :color="statusColor">
          <component :is="iconName" />
        </el-icon>
      </div>
      <h2 class="device-name">{{ device.name }}<span v-if="server" class="server-tag"> · 服务器 #{{ server.index }}</span></h2>
      <el-tag :type="effectiveStatus === 'normal' ? 'success' : effectiveStatus" effect="dark" round>
        {{ statusText }}
      </el-tag>
      <el-tag v-if="hasLive" type="info" effect="plain" size="small" class="live-tag">
        <span class="live-dot" />实时
      </el-tag>

      <el-descriptions :column="1" border class="info-list">
        <el-descriptions-item label="设备编号">{{ device.id }}</el-descriptions-item>
        <el-descriptions-item label="管理 IP">{{ device.info.ip }}</el-descriptions-item>
        <el-descriptions-item label="说明">{{ device.info.description }}</el-descriptions-item>
        <el-descriptions-item v-if="server" label="机柜槽位">第 {{ server.index }} 槽 / 共 {{ server.total }} 槽</el-descriptions-item>
      </el-descriptions>

      <!-- UPS 专属运行状态 -->
      <template v-if="upsInfo">
        <el-divider content-position="left">UPS 运行状态</el-divider>
        <el-descriptions :column="1" border class="info-list">
          <el-descriptions-item label="电池续航">{{ upsInfo.batteryRuntime }}</el-descriptions-item>
          <el-descriptions-item label="电池容量">{{ upsInfo.batteryCapacity }}</el-descriptions-item>
          <el-descriptions-item label="内部温度">{{ upsInfo.internalTemp }}</el-descriptions-item>
          <el-descriptions-item label="市电状态">
            <el-tag :type="mainsTagType" effect="plain" size="small">{{ upsInfo.mainsStatus }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="输出负载">{{ upsInfo.outputLoad }}</el-descriptions-item>
        </el-descriptions>

        <el-button class="detail-btn" type="primary" plain :icon="View" @click="showDetail = !showDetail">
          {{ showDetail ? '收起详情' : '查看详情' }}
        </el-button>

        <el-collapse-transition>
          <el-descriptions v-if="showDetail" :column="1" border class="info-list detail-block">
            <el-descriptions-item label="UPS输入A相电压">{{ upsInfo.detail.inputVoltageA }}</el-descriptions-item>
            <el-descriptions-item label="UPS输入B相电压">{{ upsInfo.detail.inputVoltageB }}</el-descriptions-item>
            <el-descriptions-item label="UPS输入C相电压">{{ upsInfo.detail.inputVoltageC }}</el-descriptions-item>
            <el-descriptions-item label="UPS输入频率">{{ upsInfo.detail.inputFrequency }}</el-descriptions-item>
            <el-descriptions-item label="UPS输出电压">{{ upsInfo.detail.outputVoltage }}</el-descriptions-item>
            <el-descriptions-item label="电池组电压">{{ upsInfo.detail.batteryVoltage }}</el-descriptions-item>
          </el-descriptions>
        </el-collapse-transition>

        <!-- 电池实时数据（来自 UPS HTTP 适配器，原始 JSON 键值完整展示） -->
        <template v-if="upsInfo && upsInfo.batteryRaw && Object.keys(upsInfo.batteryRaw).length">
          <el-divider content-position="left">电池实时数据（适配器）</el-divider>
          <el-descriptions :column="1" border class="info-list">
            <el-descriptions-item
              v-for="(val, key) in upsInfo.batteryRaw"
              :key="key"
              :label="key"
            >{{ val }}</el-descriptions-item>
          </el-descriptions>
        </template>

        <!-- UPS 主机实时数据（输入/输出，来自适配器） -->
        <template
          v-if="upsInfo && upsInfo.upsRaw && (Object.keys(upsInfo.upsRaw.input || {}).length || Object.keys(upsInfo.upsRaw.output || {}).length)"
        >
          <el-divider content-position="left">UPS 实时数据（适配器）</el-divider>
          <el-descriptions :column="1" border class="info-list">
            <el-descriptions-item
              v-for="(val, key) in upsInfo.upsRaw.input"
              :key="'in-' + key"
              :label="'输入·' + key"
            >{{ val }}</el-descriptions-item>
            <el-descriptions-item
              v-for="(val, key) in upsInfo.upsRaw.output"
              :key="'out-' + key"
              :label="'输出·' + key"
            >{{ val }}</el-descriptions-item>
          </el-descriptions>
        </template>
      </template>

      <!-- 空调专属运行状态 -->
      <template v-if="acInfo">
        <el-divider content-position="left">空调运行状态</el-divider>
        <el-descriptions :column="1" border class="info-list">
          <el-descriptions-item label="机组模式设定">{{ acInfo.mode }}</el-descriptions-item>
          <el-descriptions-item label="制冷温度设定值">{{ acInfo.coolingSetpoint }}</el-descriptions-item>
          <el-descriptions-item label="内风机设定风速">{{ acInfo.fanSpeed }}</el-descriptions-item>
          <el-descriptions-item label="当前运行状态">
            <el-tag :type="acRunTagType" effect="plain" size="small">{{ acInfo.runStatus }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <el-button class="detail-btn" type="primary" plain :icon="View" @click="showAcDetail = !showAcDetail">
          {{ showAcDetail ? '收起详情' : '查看详情' }}
        </el-button>

        <el-collapse-transition>
          <el-descriptions v-if="showAcDetail" :column="1" border class="info-list detail-block">
            <el-descriptions-item label="滤网状态">
              <el-tag :type="acInfo.detail.filterStatus.includes('正常') ? 'success' : 'warning'" effect="plain" size="small">{{ acInfo.detail.filterStatus }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="压缩机高压状态">{{ acInfo.detail.compHighPressure }}</el-descriptions-item>
            <el-descriptions-item label="压缩机低压状态">{{ acInfo.detail.compLowPressure }}</el-descriptions-item>
            <el-descriptions-item label="压缩机排气状态">{{ acInfo.detail.compDischargeTemp }}</el-descriptions-item>
            <el-descriptions-item label="内风机保护状态">{{ acInfo.detail.fanProtection }}</el-descriptions-item>
            <el-descriptions-item label="内风机过载状态">{{ acInfo.detail.fanOverload }}</el-descriptions-item>
            <el-descriptions-item label="机组开关设定">{{ acInfo.detail.unitPowerSetting }}</el-descriptions-item>
            <el-descriptions-item label="回风温度数据">{{ acInfo.detail.returnAirTemp }}</el-descriptions-item>
          </el-descriptions>
        </el-collapse-transition>
      </template>

      <!-- 温湿度传感器读数 -->
      <template v-if="sensorInfo">
        <el-divider content-position="left">温湿度读数</el-divider>
        <el-descriptions :column="1" border class="info-list">
          <el-descriptions-item label="当前温度">{{ sensorInfo.temperature }}</el-descriptions-item>
          <el-descriptions-item label="当前湿度">{{ sensorInfo.humidity }}</el-descriptions-item>
          <el-descriptions-item label="测量范围">{{ sensorInfo.range }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- 烟感传感器读数 -->
      <template v-if="smokeInfo">
        <el-divider content-position="left">烟感探测</el-divider>
        <el-descriptions :column="1" border class="info-list">
          <el-descriptions-item label="探测状态">
            <el-tag :type="smokeInfo.status.includes('无烟雾') ? 'success' : 'danger'" effect="plain" size="small">{{ smokeInfo.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="探测灵敏度">{{ smokeInfo.sensitivity }}</el-descriptions-item>
          <el-descriptions-item label="报警阈值">{{ smokeInfo.alarmThreshold }}</el-descriptions-item>
          <el-descriptions-item label="最近测试">{{ smokeInfo.lastTest }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- 门禁监测 -->
      <template v-if="doorInfo">
        <el-divider content-position="left">门禁监测</el-divider>
        <el-descriptions :column="1" border class="info-list">
          <el-descriptions-item label="人体检测">
            <el-tag :type="doorInfo.bodyDetect.includes('无人员') ? 'success' : 'warning'" effect="plain" size="small">{{ doorInfo.bodyDetect }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="最近通行">{{ doorInfo.bodyLastTime }}</el-descriptions-item>
          <el-descriptions-item label="水浸检测">
            <el-tag :type="doorInfo.waterDetect.includes('无积水') ? 'success' : 'danger'" effect="plain" size="small">{{ doorInfo.waterDetect }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="积水深度">{{ doorInfo.waterLevel }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- <div class="actions">
        <el-button type="primary" :icon="VideoPlay">查看监控</el-button>
        <el-button :icon="Document">查看日志</el-button>
      </div> -->
    </div>
    <el-empty v-else description="点击场景中的设备查看详情" />
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import {
  VideoPlay,
  Document,
  SetUp,
  OfficeBuilding,
  FirstAidKit,
  Lock,
  ColdDrink,
  Monitor,
  View,
  Sunny,
  Bell
} from '@element-plus/icons-vue'

const store = useStore()

const device = computed(() => store.getters.selectedDevice)
const server = computed(() => store.getters.selectedServer)
const visible = computed({
  get: () => !!device.value && device.value.type !== 'camera',
  set: (val) => {
    if (!val) store.dispatch('clearDevice')
  }
})

// 该设备的实时数据（来自 SDK），无则为 null
const live = computed(() => {
  if (!device.value) return null
  const info = store.state.realtime.liveInfo[device.value.id]
  return info || null
})
const hasLive = computed(() => !!live.value)
// 生效状态：实时状态优先，否则用静态状态
const effectiveStatus = computed(() => {
  if (!device.value) return 'normal'
  return (store.state.realtime.liveStatus && store.state.realtime.liveStatus[device.value.id]) || device.value.status
})

// 将静态对象与实时补丁深度合并（实时值覆盖，未提供的键保留静态值）
function mergeLive(staticObj, patch) {
  if (!staticObj) return staticObj
  if (!patch) return staticObj
  const out = Array.isArray(staticObj) ? [...staticObj] : { ...staticObj }
  for (const k in patch) {
    const v = patch[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = mergeLive(out[k] || {}, v)
    } else if (v !== undefined && v !== '') {
      out[k] = v
    }
  }
  return out
}

// UPS 专属指标（主机/电池柜均在 info.ups 中携带）
const upsInfo = computed(() => {
  if (device.value && device.value.type === 'ups' && device.value.info && device.value.info.ups) {
    return mergeLive(device.value.info.ups, live.value)
  }
  return null
})

const mainsTagType = computed(() => {
  if (!upsInfo.value) return 'success'
  return upsInfo.value.mainsStatus.includes('正常') ? 'success' : 'warning'
})

// 空调专属指标
const acInfo = computed(() => {
  if (device.value && device.value.type === 'ac' && device.value.info && device.value.info.ac) {
    return mergeLive(device.value.info.ac, live.value)
  }
  return null
})

const acRunTagType = computed(() => {
  if (!acInfo.value) return 'success'
  const s = acInfo.value.runStatus
  if (s.includes('运行')) return 'success'
  if (s.includes('故障') || s.includes('停机')) return 'danger'
  return 'warning'
})

// 温湿度传感器读数
const sensorInfo = computed(() => {
  if (device.value && device.value.type === 'sensor' && device.value.info && device.value.info.sensor) {
    return mergeLive(device.value.info.sensor, live.value)
  }
  return null
})

// 烟感传感器读数
const smokeInfo = computed(() => {
  if (device.value && device.value.type === 'smoke' && device.value.info && device.value.info.smoke) {
    return mergeLive(device.value.info.smoke, live.value)
  }
  return null
})

// 门禁监测读数
const doorInfo = computed(() => {
  if (device.value && device.value.type === 'door' && device.value.info && device.value.info.door) {
    return mergeLive(device.value.info.door, live.value)
  }
  return null
})

const showDetail = ref(false)
const showAcDetail = ref(false)
watch(
  () => device.value && device.value.id,
  () => { showDetail.value = false; showAcDetail.value = false }
)

const statusText = computed(() => {
  if (!device.value) return ''
  const map = { normal: '运行正常', warning: '告警', danger: '故障' }
  return map[effectiveStatus.value] || '未知'
})

const statusColor = computed(() => {
  if (!device.value) return '#38bdf8'
  const map = { normal: '#22c55e', warning: '#f59e0b', danger: '#ef4444' }
  return map[effectiveStatus.value] || '#38bdf8'
})

const iconName = computed(() => {
  if (!device.value) return 'Monitor'
  const map = {
    rack: 'SetUp',
    ups: 'OfficeBuilding',
    console: 'Monitor',
    extinguisher: 'FirstAidKit',
    door: 'Lock',
    ac: 'ColdDrink',
    sensor: 'Sunny',
    smoke: 'Bell'
  }
  return map[device.value.type] || 'Monitor'
})

function handleClose() {
  store.dispatch('clearDevice')
}
</script>

<style scoped>
.detail-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
}

.device-icon {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.device-name {
  font-size: 20px;
  margin-bottom: 8px;
  color: #e2e8f0;
}

.info-list {
  width: 100%;
  margin-top: 24px;
}

.actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.server-tag {
  font-size: 14px;
  font-weight: 400;
  color: #38bdf8;
}

.live-tag {
  margin-left: 8px;
  vertical-align: middle;
}

.live-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  margin-right: 4px;
  box-shadow: 0 0 4px #22c55e;
  animation: live-blink 1s infinite;
}

@keyframes live-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.detail-btn {
  margin-top: 16px;
  align-self: flex-start;
}

.detail-block {
  margin-top: 16px;
}
</style>
