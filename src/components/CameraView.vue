<template>
  <el-dialog
    v-if="device"
    v-model="visible"
    :title="dialogTitle"
    width="680px"
    :before-close="handleClose"
    class="camera-dialog"
    append-to-body
  >
    <div class="camera-wrap">
      <el-alert
        type="info"
        :closable="false"
        class="hint"
        title="实时监控说明"
        description="点击「查看监控」将在新标签页打开摄像头实时画面（外部访问页面）。"
      />

      <!-- 摄像头基本信息 -->
      <el-descriptions :column="1" border class="cfg-list" title="摄像头基本信息">
        <el-descriptions-item label="设备型号">{{ device.info.brand }} {{ device.info.model }}</el-descriptions-item>
        <el-descriptions-item label="接入协议">{{ device.info.protocol }} · 端口 {{ device.info.port }}</el-descriptions-item>
        <el-descriptions-item label="管理地址">{{ device.info.ip }}</el-descriptions-item>
        <el-descriptions-item label="登录账号">{{ device.info.username }}</el-descriptions-item>
        <el-descriptions-item label="登录密码">
          <span v-if="showPwd" class="pwd">{{ device.info.password }}</span>
          <span v-else class="pwd">••••••••••••</span>
          <el-button link type="primary" size="small" @click="showPwd = !showPwd">
            {{ showPwd ? '隐藏' : '显示' }}
          </el-button>
        </el-descriptions-item>
        <el-descriptions-item label="监控页面地址">
          <span class="stream-url">{{ monitorUrl || '（未配置）' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="说明">{{ device.info.description }}</el-descriptions-item>
      </el-descriptions>

      <div class="actions">
        <el-button type="primary" :disabled="!hasMonitor" @click="openMonitor">
          <el-icon style="margin-right:4px"><VideoCamera /></el-icon>
          查看监控（新标签页）
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { VideoCamera } from '@element-plus/icons-vue'

const store = useStore()

const device = computed(() => {
  const d = store.getters.selectedDevice
  return d && d.type === 'camera' ? d : null
})

const visible = computed({
  get: () => !!device.value,
  set: (val) => { if (!val) store.dispatch('clearDevice') }
})

const dialogTitle = computed(() => device.value ? `摄像头 · ${device.value.name}` : '')

const showPwd = ref(false)
const monitorUrl = computed(() => device.value?.info?.monitorUrl || '')
const hasMonitor = computed(() => !!monitorUrl.value)

// 在新标签页打开摄像头实时监控页面（外部 IP 访问页面），避免 iframe 被 X-Frame-Options/CSP 拦截
function openMonitor() {
  if (monitorUrl.value) {
    window.open(monitorUrl.value, '_blank', 'noopener,noreferrer')
  }
}

function handleClose() {
  store.dispatch('clearDevice')
}
</script>

<style scoped>
.camera-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cfg-list { margin-top: 2px; }
.pwd { font-family: 'Courier New', monospace; }
.stream-url { font-family: 'Courier New', monospace; color: #94a3b8; word-break: break-all; }
.hint { margin-top: 2px; }
.actions {
  display: flex;
  justify-content: flex-end;
}
</style>
