<template>
  <div class="about-view">
    <el-card class="about-card">
      <template #header>
        <div class="card-header">
          <span>关于 IDC 机房可视化</span>
        </div>
      </template>
      <p>本系统基于 Vue 3 + Vue Router + Vuex + Element Plus + Three.js 构建。</p>
      <p>实现了机房三维场景的实时渲染、设备状态展示、告警面板与设备详情交互。</p>
      <p>点击 3D 场景中的任意设备，可查看该设备的运行参数与说明。</p>
      <p style="margin-top: 16px; color: #94a3b8;">版本：v1.0.0</p>
    </el-card>
  </div>
</template>

<style scoped>
.about-view {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.about-card {
  max-width: 600px;
  width: 100%;
  line-height: 2;
}

.card-header {
  font-size: 16px;
  font-weight: 600;
}
</style>
