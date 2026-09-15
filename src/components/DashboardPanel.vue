<template>
  <div class="dashboard-panel">
    <div class="panel-header">
      <h3>机房状态总览</h3>
      <span class="update-time">更新于 {{ now }}</span>
    </div>

    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">设备总数</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">{{ stats.normal }}</div>
        <div class="stat-label">运行正常</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">{{ stats.warning }}</div>
        <div class="stat-label">告警</div>
      </div>
      <div class="stat-card danger">
        <div class="stat-value">{{ stats.danger }}</div>
        <div class="stat-label">故障</div>
      </div>
    </div>

    <div class="alerts-section">
      <div class="section-title">
        <el-icon><Warning /></el-icon>
        <span>实时告警</span>
      </div>
      <el-scrollbar height="220px">
        <div
          v-for="alert in alerts"
          :key="alert.id"
          class="alert-item"
          :class="alert.level"
        >
          <div class="alert-dot"></div>
          <div class="alert-content">
            <div class="alert-message">{{ alert.message }}</div>
            <div class="alert-time">{{ alert.time }}</div>
          </div>
          <el-icon class="alert-close" @click="removeAlert(alert.id)"><Close /></el-icon>
        </div>
      </el-scrollbar>
    </div>

    <div class="legend-section">
      <div class="section-title">
        <el-icon><InfoFilled /></el-icon>
        <span>图例说明</span>
      </div>
      <div class="legend-list">
        <div class="legend-item"><span class="dot normal"></span> 运行正常</div>
        <div class="legend-item"><span class="dot warning"></span> 告警</div>
        <div class="legend-item"><span class="dot danger"></span> 故障</div>
        <div class="legend-item"><span class="dot selected"></span> 选中</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useStore } from 'vuex'
import { Warning, Close, InfoFilled } from '@element-plus/icons-vue'

const store = useStore()
const stats = computed(() => store.getters.stats)
const alerts = computed(() => store.getters.alerts)
const realtime = computed(() => store.getters.realtime)
const now = computed(() =>
  realtime.value.lastUpdate ||
  new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
)

function removeAlert(id) {
  store.commit('REMOVE_ALERT', id)
}
</script>

<style scoped>
.dashboard-panel {
  width: 280px;
  height: 100%;
  background: rgba(15, 23, 42, 0.85);
  border-left: 1px solid rgba(56, 189, 248, 0.15);
  backdrop-filter: blur(8px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  color: #e2e8f0;
}

.panel-header {
  margin-bottom: 20px;
}

.panel-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 6px;
}

.update-time {
  font-size: 12px;
  color: #94a3b8;
}

.stat-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  padding: 14px;
  text-align: center;
}

.stat-card.success .stat-value { color: #22c55e; }
.stat-card.warning .stat-value { color: #f59e0b; }
.stat-card.danger .stat-value { color: #ef4444; }

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: #38bdf8;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #94a3b8;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #e2e8f0;
}

.alerts-section {
  margin-bottom: 24px;
  flex: 1;
}

.alert-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 6px;
  background: rgba(30, 41, 59, 0.4);
  margin-bottom: 8px;
  font-size: 13px;
}

.alert-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.alert-item.warning .alert-dot { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }
.alert-item.danger .alert-dot { background: #ef4444; box-shadow: 0 0 6px #ef4444; }
.alert-item.info .alert-dot { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }

.alert-content {
  flex: 1;
}

.alert-message {
  line-height: 1.5;
  color: #e2e8f0;
}

.alert-time {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.alert-close {
  color: #64748b;
  cursor: pointer;
  flex-shrink: 0;
}

.alert-close:hover {
  color: #e2e8f0;
}

.legend-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  font-size: 12px;
  color: #cbd5e1;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.dot.normal { background: #22c55e; }
.dot.warning { background: #f59e0b; }
.dot.danger { background: #ef4444; }
.dot.selected { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }
</style>
