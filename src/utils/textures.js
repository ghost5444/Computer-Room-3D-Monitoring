import * as THREE from 'three'

function makeCanvas(size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

function grain(ctx, size, amount) {
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 255 * amount
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + v))
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + v))
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + v))
  }
  ctx.putImageData(img, 0, 0)
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// 白色瓷砖地板：白底 + 浅灰砖缝 + 釉面高光
function floorTile() {
  const size = 256
  const c = makeCanvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#eef2f6'
  ctx.fillRect(0, 0, size, size)
  grain(ctx, size, 0.025)
  // 四周砖缝（重复拼接即形成网格），浅灰 grout
  const m = 9
  ctx.fillStyle = '#c2ccd6'
  ctx.fillRect(0, 0, size, m)
  ctx.fillRect(0, size - m, size, m)
  ctx.fillRect(0, 0, m, size)
  ctx.fillRect(size - m, 0, m, size)
  // 缝内暗线增强立体
  ctx.fillStyle = 'rgba(120,135,150,0.5)'
  ctx.fillRect(0, m - 1, size, 1)
  ctx.fillRect(0, size - m, size, 1)
  ctx.fillRect(m - 1, 0, 1, size)
  ctx.fillRect(size - m, 0, 1, size)
  // 釉面高光
  const g = ctx.createLinearGradient(0, 0, size, size)
  g.addColorStop(0, 'rgba(255,255,255,0.4)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(m, m, size - 2 * m, size - 2 * m)
  return toTexture(c)
}

// 墙面：白色磨砂（哑光，极淡颗粒 + 微弱竖向板缝）
function wall() {
  const size = 512
  const c = makeCanvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#eef2f6'
  ctx.fillRect(0, 0, size, size)
  grain(ctx, size, 0.04)
  // 极淡竖向板缝
  ctx.strokeStyle = 'rgba(185,195,205,0.45)'
  ctx.lineWidth = 1
  for (let x = 0; x <= size; x += 170) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke()
  }
  // 顶部/底部轻微阴影带（磨砂质感）
  const top = ctx.createLinearGradient(0, 0, 0, size)
  top.addColorStop(0, 'rgba(0,0,0,0.04)')
  top.addColorStop(0.08, 'rgba(0,0,0,0)')
  top.addColorStop(0.92, 'rgba(0,0,0,0)')
  top.addColorStop(1, 'rgba(0,0,0,0.05)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, size, size)
  return toTexture(c)
}

// 拉丝金属
function brushedMetal(baseHex) {
  const size = 512
  const c = makeCanvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = baseHex
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < size * 3; i++) {
    const x = Math.random() * size
    const w = Math.random() * 2 + 0.4
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)'
    ctx.fillRect(x, 0, w, size)
  }
  return toTexture(c)
}

// 机柜前门：穿孔网孔
function perforated(baseHex) {
  const size = 256
  const c = makeCanvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = baseHex
  ctx.fillRect(0, 0, size, size)
  const step = 22
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      ctx.beginPath()
      ctx.arc(x, y, 3.4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x - 1, y - 1, 1.3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(130,170,210,0.3)'
      ctx.fill()
    }
  }
  return toTexture(c)
}

// 横向通风百叶
function ventSlats(baseHex) {
  const size = 256
  const c = makeCanvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = baseHex
  ctx.fillRect(0, 0, size, size)
  for (let y = 6; y < size; y += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(0, y, size, 6)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(0, y + 6, size, 2)
  }
  return toTexture(c)
}

// 空调外壳：白色塑料 + 格栅
function acUnit() {
  const size = 512
  const c = makeCanvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#e8edf2'
  ctx.fillRect(0, 0, size, size)
  grain(ctx, size, 0.02)
  ctx.strokeStyle = 'rgba(120,135,150,0.55)'
  ctx.lineWidth = 3
  for (let y = size * 0.42; y < size * 0.9; y += 14) {
    ctx.beginPath(); ctx.moveTo(size * 0.08, y); ctx.lineTo(size * 0.92, y); ctx.stroke()
  }
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  ctx.fillRect(0, 0, size, size * 0.08)
  return toTexture(c)
}

// 显示器画面
function screen() {
  const size = 256
  const c = makeCanvas(size)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, size)
  g.addColorStop(0, '#06222e')
  g.addColorStop(1, '#0a3346')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x < size; x += 6) {
    const y = size * 0.45 + Math.sin(x * 0.12) * 22 * (0.6 + Math.random() * 0.4)
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.fillStyle = 'rgba(56,189,248,0.45)'
  for (let i = 0; i < 9; i++) {
    const h = 18 + Math.random() * 70
    ctx.fillRect(16 + i * 26, size - 24 - h, 16, h)
  }
  return toTexture(c)
}

// 空调前面板：整块横向栅格（水平百叶出风口）
function acPanel() {
  const w = 220
  const h = 560
  const c = makeCanvas(w)
  const ctx = c.getContext('2d')

  // 浅灰塑料底
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#eef2f6')
  g.addColorStop(1, '#d6dde5')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  grain(ctx, w, 0.02)

  // 外框
  ctx.strokeStyle = 'rgba(120,135,150,0.6)'
  ctx.lineWidth = 4
  ctx.strokeRect(6, 6, w - 12, h - 12)

  // 横向栅格（整块水平百叶，贯穿整个面板）
  const padX = 22
  const padTop = 26
  const padBottom = 26
  const slatH = 14
  const slatGap = 12
  let y = padTop
  while (y + slatH <= h - padBottom) {
    // 横条（浅灰凸面渐变，模拟百叶受光）
    const sg = ctx.createLinearGradient(0, y, 0, y + slatH)
    sg.addColorStop(0, '#c4ccd5')
    sg.addColorStop(0.5, '#eaf0f4')
    sg.addColorStop(1, '#aab4bf')
    ctx.fillStyle = sg
    ctx.fillRect(padX, y, w - 2 * padX, slatH)
    // 下缘暗缝（通风槽）
    ctx.fillStyle = 'rgba(38,52,66,0.5)'
    ctx.fillRect(padX, y + slatH, w - 2 * padX, 3)
    y += slatH + slatGap
  }

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// 台面 laminate
function laminate() {
  const size = 256
  const c = makeCanvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#2b3340'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 240; i++) {
    const y = Math.random() * size
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = Math.random() * 1 + 0.3
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y + (Math.random() * 4 - 2)); ctx.stroke()
  }
  return toTexture(c)
}

// 灭火器筒身
function extinguisherLabel() {
  const size = 128
  const c = makeCanvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#dc2626'
  ctx.fillRect(0, 0, size, size)
  grain(ctx, size, 0.03)
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, size * 0.4, size, size * 0.2)
  ctx.fillStyle = '#1f2937'
  ctx.font = 'bold 22px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('CO₂', size / 2, size * 0.5)
  return toTexture(c)
}

// 温湿度传感器 LCD 屏：温度（青）+ 湿度（蓝）
function sensorScreen() {
  const w = 128
  const h = 128
  const c = makeCanvas(w)
  const ctx = c.getContext('2d')

  ctx.fillStyle = '#0b1f2a'
  ctx.fillRect(0, 0, w, h)
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#7dd3fc'
  ctx.font = '14px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('温湿度', 10, 16)

  ctx.fillStyle = '#38e0d0'
  ctx.font = 'bold 30px monospace'
  ctx.fillText('23.5℃', 10, 48)

  ctx.fillStyle = '#60a5fa'
  ctx.font = 'bold 26px monospace'
  ctx.fillText('45%RH', 10, 92)

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createTextures() {
  return {
    floor: floorTile(),
    wall: wall(),
    rackBody: brushedMetal('#1c2535'),
    upsBody: brushedMetal('#0e1626'),
    rackFront: perforated('#0c121d'),
    vent: ventSlats('#0e1626'),
    ac: acUnit(),
    acPanel: acPanel(),
    screen: screen(),
    consoleTop: laminate(),
    extinguisher: extinguisherLabel(),
    sensorScreen: sensorScreen()
  }
}
