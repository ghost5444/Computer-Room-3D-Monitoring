<template>
  <div class="home-view">
    <div class="scene-wrapper">
      <RoomScene />
      <div class="realtime-bar" :class="rtClass">
        <span class="rt-dot" />
        <span class="rt-text">{{ rtText }}</span>
      </div>
    </div>
    <DashboardPanel />
    <DeviceDetail />
    <CameraView />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useStore } from 'vuex'
import RoomScene from '@/components/RoomScene.vue'
import DashboardPanel from '@/components/DashboardPanel.vue'
import DeviceDetail from '@/components/DeviceDetail.vue'
import CameraView from '@/components/CameraView.vue'

const store = useStore()

const rt = computed(() => store.state.realtime)
const rtClass = computed(() => {
  if (rt.value.loading) return 'loading'
  if (rt.value.connected) return 'ok'
  if (rt.value.error) return 'error'
  return 'idle'
})
const rtText = computed(() => {
  if (rt.value.loading) return '实时数据：连接中…'
  if (rt.value.error) return `实时数据：连接失败（${rt.value.error}）`
  if (rt.value.connected) return `实时数据：已连接 · 最后更新 ${rt.value.lastUpdate || '—'} · UPS适配器${rt.value.upsOnline ? '在线' : '离线'}`
  return '实时数据：未连接'
})

onMounted(() => {
  store.dispatch('startRealtime')
})
onUnmounted(() => {
  store.dispatch('stopRealtime')
})
</script>

<style scoped>
.home-view {
  display: flex;
  width: 100%;
  height: 100%;
}

.scene-wrapper {
  flex: 1;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.realtime-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.3);
  backdrop-filter: blur(4px);
}

.rt-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.realtime-bar.ok .rt-dot {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.realtime-bar.loading .rt-dot {
  background: #f59e0b;
  animation: rt-pulse 1s infinite;
}

.realtime-bar.error .rt-dot {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

@keyframes rt-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
