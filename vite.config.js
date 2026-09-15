import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  // .glb / .fbx 走资源管线（import 后得到文件 URL），避免 Vite 尝试按 JS 解析二进制模型
  assetsInclude: ['**/*.glb', '**/*.fbx'],
  server: {
    port: 5174,
    host: true,
    proxy: {
      // 将 SDK 接口代理到内网服务器，规避浏览器跨域(CORS)限制（仅开发服务器生效）
      '/sdk': {
        target: 'http://10.0.80.32',
        changeOrigin: true
      },
      // UPS HTTP 适配器（科士达网页抓取，public/utils/ups_http_adapter.py 启动，监听 17099）
      // 重写掉 /ups 前缀，使其命中适配器的 /api/ups 等路由
      '/ups': {
        target: 'http://127.0.0.1:17099',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ups/, '')
      }
    }
  }
})
