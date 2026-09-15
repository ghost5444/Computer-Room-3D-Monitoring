<template>
  <div class="app-layout">
    <el-container class="main-container">
      <el-aside width="200px" class="side-menu">
        <div class="logo">
          <el-icon :size="28" color="#38bdf8"><DataAnalysis /></el-icon>
          <span>IDC 可视化</span>
        </div>
        <el-menu
          :default-active="$route.path"
          router
          background-color="transparent"
          text-color="#cbd5e1"
          active-text-color="#38bdf8"
        >
          <el-menu-item index="/">
            <el-icon><Monitor /></el-icon>
            <span>机房总览</span>
          </el-menu-item>
          <el-menu-item index="/about">
            <el-icon><InfoFilled /></el-icon>
            <span>关于</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-container>
        <el-header class="top-header">
          <div class="header-title">机房三维可视化监控系统</div>
          <div class="header-actions">
            <el-button type="primary" :icon="Refresh" size="small" @click="refresh">
              刷新
            </el-button>
            
          </div>
        </el-header>

        <el-main class="main-content">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { Refresh, User, Monitor, InfoFilled, DataAnalysis } from '@element-plus/icons-vue'

function refresh() {
  window.location.reload()
}
</script>

<style scoped>
.app-layout {
  width: 100%;
  height: 100%;
}

.main-container {
  height: 100%;
}

.side-menu {
  background: rgba(15, 23, 42, 0.95);
  border-right: 1px solid rgba(56, 189, 248, 0.1);
  display: flex;
  flex-direction: column;
}

.logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: #e2e8f0;
  border-bottom: 1px solid rgba(56, 189, 248, 0.1);
}

.top-header {
  background: rgba(15, 23, 42, 0.85);
  border-bottom: 1px solid rgba(56, 189, 248, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #e2e8f0;
  backdrop-filter: blur(8px);
}

.header-title {
  font-size: 16px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.main-content {
  padding: 0;
  background: #0b1120;
  overflow: hidden;
}
</style>
