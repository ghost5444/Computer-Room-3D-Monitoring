<template>
  <div ref="container" class="scene-container">
    <div ref="labelContainer" class="label-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useStore } from 'vuex'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
// import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { devices } from '@/utils/deviceData.js'
import { createTextures } from '@/utils/textures.js'
// 机房中央人物（带骨架的 Mixamo FBX，由 walk/idle/turn 动画驱动）。—— 已注释禁用
// 注意：人物与三个动画 FBX 是同一套 Mixamo 骨架（骨骼名一致），
// 因此动画片段可直接套到人物身上（无需跨骨架重定向），见 setupCharacterAnimation。
// 人物模型与动画 FBX —— 已注释禁用（2026-09-10）
// import charModelUrl from '@/3dmodel/women/人物_new.fbx'
// 人物动作 FBX（women 目录带 _new 版本：行走 / 待机 / 转身）
// import walkFbxUrl from '@/3dmodel/women/行走_new.fbx'
// import idleFbxUrl from '@/3dmodel/women/待机_new.fbx'
// import turnFbxUrl from '@/3dmodel/women/转身_new.fbx'
// 设备 3D 模型（均为 Draco 压缩 GLB，由共享 gltfLoader 加载，解码器在 public/draco）
import rackUrl from '@/3dmodel/机柜(无隔板).glb'
import upsHostUrl from '@/3dmodel/UPS主机.glb'
import upsBatteryUrl from '@/3dmodel/UPS电池组.glb'
import extinguisherUrl from '@/3dmodel/灭火器.glb'
import doorUrl from '@/3dmodel/防火门(金属).glb'
import acUrl from '@/3dmodel/空调-蓝.glb'
import cameraUrl from '@/3dmodel/半球摄像头.glb'
// 细化配件模型（放置于对应设备附近，作为装饰，不参与设备拾取）
import switchUrl from '@/3dmodel/交换机.glb'
import bladeUrl from '@/3dmodel/刀片服务器.glb'
import ontUrl from '@/3dmodel/光猫.glb'
import envUrl from '@/3dmodel/动环.glb'
import firewallUrl from '@/3dmodel/防火墙.glb'
import recorderUrl from '@/3dmodel/监控录像机.glb'
import deskUrl from '@/3dmodel/电脑桌.glb'

// 共享 GLTF 加载器（带 Draco 解码器，解码器文件位于 public/draco，由 vite 直接以 /draco/ 提供）
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

const store = useStore()
const container = ref(null)
const labelContainer = ref(null)

let scene, camera, renderer, labelRenderer, controls, raycaster, mouse
let animationId
let T = null
const deviceMeshes = []
const serverMeshes = []
const statusArrows = []
const cables = []
const acWinds = [] // 空调出风口气流粒子
const smokeLeds = [] // 烟感报警红光
const originalColors = new Map()

// 机房中央展示模型（GLB）
let centerModel = null
let centerMixer = null
const modelClock = new THREE.Clock()

const ROOM_WIDTH = 9
const ROOM_DEPTH = 6
const WALL_HEIGHT = 3

// ===== 中央人物：行走 / 待机 / 转身 巡逻动画 =====

// 椭圆巡逻：人物在机房中央空地沿椭圆轨迹往返巡逻（走 → 待机 → 转身 → 走）。
// 椭圆范围已避开所有设备：机柜前表面 z≈0.75、空调 x≈-4.2、后墙操作台/UPS z≈-2.1。
const PATROL = {
  cx: 0,                 // 椭圆中心 x（机房横向中心）
  cz: -0.5,              // 椭圆中心 z（机柜 z=1.5 与后墙设备 z≈-2.5 之间的空地）
  radiusX: 3.0,          // 长轴半径(x)，左右不碰空调(x<-3.9)与右墙(x=4.5)
  radiusZ: 0.9,          // 短轴半径(z)，前后不碰机柜(z>0.75)与操作台(z<-2.0)
  theta0: -Math.PI / 2,  // 起始角度（椭圆最靠近操作台侧）
  speed: 0.7,            // 行走线速度(m/s)
  idleSeconds: 3.0,      // 停留（待机）时长
  fadeSeconds: 0.35,     // 动作/转身过渡时长
  turnSeconds: 0.9,      // 无骨骼模型原地转身时长（整体旋转 180°）
  loopAngle: Math.PI * 2 // 每次行走累计转角（整圈→转身返回，即椭圆来回巡逻）
}

// 转身片段自身已把身体旋转约 180°（实测 -184°）。
// 因此转身播放期间**不能**同时旋转模型根节点，否则观感是转满 360°；
// 正确做法：转身片段放完、交叉淡出到下一个动作时，再把这 180° 补到根节点上——
// 身体"转过去"与根节点"补回来"同时发生、相互抵消，人物朝向保持连续。
const TURN_BODY_YAW = -Math.PI

// 朝向微调：若人物背身行走改为 Math.PI，侧身行走改为 ±Math.PI/2
const FACING_OFFSET = 0
// 左右腿微调：若重定向后双腿交叉/镜像（Mixamo 与 Biped 左右约定不一致时），改为 true
const SWAP_LR = false

// 人物(人物_new.fbx)与三个动画 FBX 是同一套 Mixamo 骨架（骨骼名一致，
// 角色 23 根 / 动画 28 根，差异仅在于动画多了 Head_end/LeftHand_end 等末端 tip 骨），
// 因此动画片段可直接按骨骼名绑定到人物身上，无需跨骨架重定向。
// 仅保留 .quaternion 轨道：规避 FBX 厘米制带来的根运动(root motion)漂移，
// 让人物在机房里"原地走/转身"，整体位置由下方椭圆巡逻状态机控制。

const CHAR_STATE = { IDLE: 'idle', WALK: 'walk', TURN: 'turn' }
const UP_AXIS = new THREE.Vector3(0, 1, 0)

let charClips = { walk: null, idle: null, turn: null }
let charActions = null
let currentAction = null
let charState = CHAR_STATE.IDLE
let stateTime = 0
let walkDir = 1        // +1: 空调 → 对向墙面；-1: 返回空调
let rootYaw = 0        // 模型根节点偏航（我们自己控制的朝向）
let rootRamp = null    // 转身结束后把 180° 补到根节点的过渡
let turnFaded = false
let facingBaseYaw = 0  // 根节点未旋转时，人物在世界空间的前向角
let patrolTheta = PATROL.theta0  // 椭圆当前参数角
let patrolAccum = 0              // 本次行走累计转角（达 loopAngle 触发转身）

function init() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b1120)
  scene.fog = new THREE.Fog(0x0b1120, 8, 25)

  camera = new THREE.PerspectiveCamera(
    45,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    100
  )
  camera.position.set(8, 8, 10)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.value.appendChild(renderer.domElement)

  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  T = createTextures()

  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(container.value.clientWidth, container.value.clientHeight)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.top = '0'
  labelRenderer.domElement.style.left = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  container.value.appendChild(labelRenderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 4
  controls.maxDistance = 20
  controls.maxPolarAngle = Math.PI / 2.1
  controls.target.set(0, 0.5, 0)

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  addLights()
  addRoom()
  addFloorGrid()
  addDevices()
  // addCables()
  // loadCenterModel()

  // 浏览器控制台调试钩子（可查人物/相机/骨骼世界坐标，便于排查布局/不显示类问题）
  window.__IDC = {
    scene: () => scene,
    camera: () => camera,
    char: () => centerModel,
    boneBox: () => {
      const c = centerModel
      if (!c) return null
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      const p = new THREE.Vector3()
      let count = 0
      c.traverse((o) => {
        if (o.isBone) {
          count++
          o.getWorldPosition(p)
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], p.getComponent(i))
            max[i] = Math.max(max[i], p.getComponent(i))
          }
        }
      })
      return { bones: count, min: min.map((v) => +v.toFixed(3)), max: max.map((v) => +v.toFixed(3)) }
    }
  }

  window.addEventListener('resize', onResize)
  renderer.domElement.addEventListener('click', onClick)
  renderer.domElement.addEventListener('mousemove', onMouseMove)

  animate()
}

function addLights() {
  const ambient = new THREE.AmbientLight(0x38bdf8, 0.35)
  scene.add(ambient)

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(5, 10, 5)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 2048
  dirLight.shadow.mapSize.height = 2048
  scene.add(dirLight)

  const fillLight = new THREE.PointLight(0x38bdf8, 0.4, 15)
  fillLight.position.set(-3, 4, -3)
  scene.add(fillLight)

  const warmLight = new THREE.PointLight(0xf59e0b, 0.25, 12)
  warmLight.position.set(3, 3, 3)
  scene.add(warmLight)
}

function addRoom() {
  const floorGeo = new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH)
  const floorMat = new THREE.MeshStandardMaterial({
    map: T.floor,
    roughness: 0.4,
    metalness: 0.08
  })
  T.floor.repeat.set(ROOM_WIDTH / 0.6, ROOM_DEPTH / 0.6)
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const wallMat = new THREE.MeshStandardMaterial({
    map: T.wall,
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0.0,
    side: THREE.DoubleSide
  })
  T.wall.repeat.set(3, 1)

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, WALL_HEIGHT), wallMat)
  backWall.position.set(0, WALL_HEIGHT / 2, -ROOM_DEPTH / 2)
  backWall.receiveShadow = true
  scene.add(backWall)

  const sideWallMat = wallMat.clone()
  sideWallMat.map = T.wall.clone()
  sideWallMat.map.repeat.set(2, 1)
  sideWallMat.map.needsUpdate = true

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_DEPTH, WALL_HEIGHT), sideWallMat)
  leftWall.rotation.y = Math.PI / 2
  leftWall.position.set(-ROOM_WIDTH / 2, WALL_HEIGHT / 2, 0)
  leftWall.receiveShadow = true
  scene.add(leftWall)

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_DEPTH, WALL_HEIGHT), sideWallMat.clone())
  rightWall.rotation.y = -Math.PI / 2
  rightWall.position.set(ROOM_WIDTH / 2, WALL_HEIGHT / 2, 0)
  rightWall.receiveShadow = true
  scene.add(rightWall)

  const baseboardMat = new THREE.MeshBasicMaterial({ color: 0x334155 })
  const baseHeight = 0.12
  const baseDepth = 0.05

  const backBase = new THREE.Mesh(new THREE.BoxGeometry(ROOM_WIDTH, baseHeight, baseDepth), baseboardMat)
  backBase.position.set(0, baseHeight / 2, -ROOM_DEPTH / 2 + baseDepth / 2)
  scene.add(backBase)

  const leftBase = new THREE.Mesh(new THREE.BoxGeometry(baseDepth, baseHeight, ROOM_DEPTH), baseboardMat)
  leftBase.position.set(-ROOM_WIDTH / 2 + baseDepth / 2, baseHeight / 2, 0)
  scene.add(leftBase)

  const rightBase = new THREE.Mesh(new THREE.BoxGeometry(baseDepth, baseHeight, ROOM_DEPTH), baseboardMat)
  rightBase.position.set(ROOM_WIDTH / 2 - baseDepth / 2, baseHeight / 2, 0)
  scene.add(rightBase)
}

function addFloorGrid() {
  const gridHelper = new THREE.GridHelper(ROOM_WIDTH, Math.floor(ROOM_WIDTH / 0.6), 0xcbd5e1, 0xcbd5e1)
  gridHelper.position.y = 0.01
  gridHelper.material.transparent = true
  gridHelper.material.opacity = 0.35
  scene.add(gridHelper)
}

function addDevices() {
  devices.forEach(device => {
    const group = new THREE.Group()
    group.position.set(device.position.x, 0, device.position.z)
    group.userData = { device }

    const statusColor = getStatusColor(device.status)

    if (device.type === 'rack') {
      buildRack(group, device, statusColor)
    } else if (device.type === 'ups') {
      buildUps(group, device, statusColor)
    } else if (device.type === 'console') {
      buildConsole(group, device, statusColor)
    } else if (device.type === 'extinguisher') {
      buildExtinguisher(group, device)
    } else if (device.type === 'door') {
      buildDoor(group, device)
    } else if (device.type === 'ac') {
      buildAc(group, device, statusColor)
    } else if (device.type === 'camera') {
      buildCamera(group, device, statusColor)
    } else if (device.type === 'sensor') {
      buildSensor(group, device, statusColor)
    } else if (device.type === 'smoke') {
      buildSmoke(group, device, statusColor)
    }

    scene.add(group)
    deviceMeshes.push(group)

    addLabel(group, device)

    // 告警(warning) / 故障(danger) 设备：在其上方标记对应颜色的 3D 浮动箭头
    if (device.status === 'warning' || device.status === 'danger') {
      addStatusArrow(group, device, statusColor, device.id)
    }
  })
}

function addPropLabel(group, text) {
  const div = document.createElement('div')
  div.className = 'device-label'
  const inner = document.createElement('div')
  inner.className = 'device-label-inner'
  inner.textContent = text
  div.appendChild(inner)
  const label = new CSS2DObject(div)
  label.position.set(0, 0.55, 0)
  group.add(label)
}

// ---------- 机柜内设备摆放 ----------
// 将交换机/刀片服务器/动环主机等细化模型缩放到适配机柜内腔，按指定顺序自上而下堆叠。
// 机柜局部 +z 为开门面（朝向通道）；设备置于开门面内侧，正面朝通道。
// 注：防火墙、监控录像机 已有对应 GLB（防火墙.glb / 监控录像机.glb），见下方 RACK_DEVICE_MODELS。
const RACK_LAYOUT = {
  'rack-network': [
    { model: 'switch', label: '交换机' },
    { model: 'nvr', label: '监控录像机' },
    { model: 'firewall', label: '防火墙' },
    { model: 'switch', label: '交换机' },
    { model: 'switch', label: '交换机' },
    { model: 'switch', label: '交换机' },
    { model: 'modem-pair', label: '光猫' }
  ],
  'rack-server-2': [
    { model: 'env', label: '动环服务器' },
    { model: 'switch', label: '交换机' },
    { model: 'blade', label: '刀片服务器' },
    { model: 'blade', label: '刀片服务器' },
    { model: 'blade', label: '刀片服务器' }
  ],
  'rack-server-1': [
    { model: 'blade', label: '刀片服务器' },
    { model: 'blade', label: '刀片服务器' },
    { model: 'blade', label: '刀片服务器' },
    { model: 'blade', label: '刀片服务器' }
  ]
}
// 机柜内各子设备类型 → GLB 模型（均为 Draco 压缩）
const RACK_DEVICE_MODELS = {
  switch: switchUrl,
  blade: bladeUrl,
  env: envUrl,
  modem: ontUrl,
  firewall: firewallUrl,
  nvr: recorderUrl
}

// 机柜内设备的点击详情信息（静态说明；SDK 未提供这些子设备的实时因子，故无实时字段）
const RACK_DEVICE_INFO = {
  switch: { ip: '-', description: '接入层交换机：负责机房内服务器与办公终端的网络接入、VLAN 划分与二层转发。' },
  firewall: { ip: '-', description: '边界防火墙：承载内外网访问控制、NAT 与 VPN 隧道，是机房网络安全的第一道防线。' },
  nvr: { ip: '-', description: '网络硬盘录像机（NVR）：接入并存储机房摄像头视频流，支持按时间回放与远程调阅。' },
  blade: { ip: '-', description: '刀片服务器：高密度计算单元，通过机箱背板共享电源与交换，承载虚拟化与核心业务系统。' },
  env: { ip: '-', description: '动环监控服务器：采集温湿度、烟感、水浸、门禁等环境数据并上送运维平台。' },
  'modem-pair': { ip: '-', description: '光猫（ONU）：将机房内网经光纤上联至运营商，提供互联网出口。' }
}

// 在机柜 group 内自上而下填充设备（group 已带 rotation.y=π，局部 +z 为开门侧）
function fillRackInternals(group, device) {
  const layout = RACK_LAYOUT[device.id]
  if (!layout) return
  const { width: w, depth: d, height: h } = device.size
  const innerW = w - 0.1            // 内腔可用宽
  // 机柜模型自身经 rotY=π 转向，group 未旋转；局部 -z 对应开门面/通道侧
  // 设备前表面与机柜前门框基本平齐（0.02m 退后，避免与门模型 z-fighting），
  // 同时设备在 X（左右）、Y（上下）方向均居中 → 整体位于机柜正中央、前面板贴门框。
  const frontZ = -(d / 2)    // 开门面内侧（负数朝向通道）
  const bottomY = 0.28
  const topY = h - 0.18
  const slotH = (topY - bottomY) / layout.length
  const devFitH = slotH * 0.82      // 每个设备占槽位高度的 82%，上下留合适间隙

  layout.forEach((slot, i) => {
    // 自上而下：第 0 行在最上方
    const centerY = topY - (i + 0.5) * slotH
    // 该槽位设备元信息（供点击详情面板使用；_rackSlot 标记机柜内子设备，点击时优先于柜体）
    const rackDevice = {
      id: `${device.id}__${slot.model}__${i}`,
      name: slot.label,
      type: slot.model,
      status: 'normal',
      info: RACK_DEVICE_INFO[slot.model] || { ip: '—', description: '' },
      _rackSlot: true
    }
    if (slot.model === 'modem-pair') {
      const halfW = innerW / 2
      ;[-1, 1].forEach((s) => {
        placeRackDevice(group, RACK_DEVICE_MODELS.modem, s * (halfW / 2) + 0.05, centerY, frontZ + 0.30, halfW * 0.86, devFitH, d - 0.3, Math.PI, {
          device: { ...rackDevice, id: `${rackDevice.id}__${s > 0 ? 2 : 1}` },
          slotIndex: i,
          totalSlots: layout.length
        })
      })
    }else if (RACK_DEVICE_MODELS[slot.model]) {
      let offsetX = 0
      let frontTempZ = frontZ
      if(slot.model === 'switch'){
        offsetX = 0.09
        frontTempZ += 0.20
      }
      if(slot.model === 'blade'){
        offsetX = 0.08
        frontTempZ += 0.05
      }
      if(slot.model === 'env'){
        offsetX = 0.10
        frontTempZ += 0.20
      }
      if(slot.model === 'firewall'){
        offsetX = 0.09
        frontTempZ += 0.20
      }
      if(slot.model === 'nvr'){
        offsetX = 0.06
        frontTempZ += 0.20
      }
      placeRackDevice(group, RACK_DEVICE_MODELS[slot.model], offsetX, centerY, frontTempZ, innerW, devFitH, d - 0.3, Math.PI, {
        device: rackDevice,
        slotIndex: i,
        totalSlots: layout.length
      })
    } else {
      // 暂无模型：占位 Box + 名称标签，便于识别与后续替换
      placeRackPlaceholder(group, 0, centerY, frontZ, innerW, devFitH, d - 0.3, Math.PI, slot.label)
    }
  })
}

// 把单个设备 GLB 缩放到「适配内腔」（宽/高/深同时约束），置于局部坐标 (x,y,z)；
// 同时注册为可点击对象（与顶部设备一致），点击后在详情面板展示该设备的说明信息。
function placeRackDevice(parentGroup, url, x, y, z, fitW, fitH, fitD, rotY, opts) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.userData.device = opts.device       // 点击详情所需元信息
  parentGroup.add(g)
  deviceMeshes.push(g)                  // 注册为可点击对象（getHitObjects 取 userData.hitMesh）
  gltfLoader.load(
    url,
    (gltf) => {
      const m = gltf.scene
      m.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true
          o.receiveShadow = true
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((mm) => { if (mm && mm.map) mm.map.colorSpace = THREE.SRGBColorSpace })
        }
      })
      let box = new THREE.Box3().setFromObject(m)
      let size = box.getSize(new THREE.Vector3())
      // 等比缩放：取「高/宽/深」三者中最受限的系数，保证不超出内腔、被机柜完全容纳
      const scale = Math.min(
        fitH / (size.y || 1),
        fitW / (size.x || 1),
        fitD / (size.z || 1)
      )
      m.scale.setScalar(scale)
      box = new THREE.Box3().setFromObject(m)
      size = box.getSize(new THREE.Vector3())
      const c = box.getCenter(new THREE.Vector3())
      m.position.x = -c.x                     // 水平居中（X 轴对齐机柜中心）
      m.position.z = -box.min.z               // 前表面与 group 原点对齐 → 设备前表面平齐机柜门框（位于 z=frontZ）
      m.position.y = -box.min.y               // 脚底对齐 group 底面（该设备槽位中心，Y 方向居中）
      m.rotation.y = rotY
      g.add(m)
      g.userData.hitMesh = m                  // 命中网格（加载完成后才参与拾取）
      // 槽位序号供详情面板展示「机柜槽位」
      m.userData.serverIndex = opts.slotIndex + 1
      m.userData.totalServers = opts.totalSlots
    },
    undefined,
    (e) => {
      console.error('机柜内设备 GLB 加载失败:', url, e)
      g.userData.hitMesh = g                 // 降级：仍以占位组参与拾取
    }
  )
}

// 暂无 GLB 的设备：用占位 Box 代替（带名称标签）
function placeRackPlaceholder(parentGroup, x, y, z, fitW, fitH, fitD, rotY, label) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  const geo = new THREE.BoxGeometry(fitW, fitH, fitD)
  const mat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.4 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = fitH / 2
  mesh.position.z = fitD / 2               // 前表面与 group 原点对齐 → 平齐机柜门框
  mesh.rotation.y = rotY
  mesh.castShadow = true
  mesh.receiveShadow = true
  g.add(mesh)
  parentGroup.add(g)
  if (label) addPropLabel(g, label)
}

function getStatusColor(status) {
  switch (status) {
    case 'warning': return 0xf59e0b
    case 'danger': return 0xef4444
    default: return 0x38bdf8
  }
}

// ---------- 设备 GLB 替换简模：共享加载器 + 每模型摆放参数 ----------
// rotY 为模型整体偏航（绕 Y），scaleMul 为在「按高度等比缩放」基础上的微调系数。
// 模型朝向/比例不直观时，只改这里的常量即可，无需改动各 build 函数。
const GLB_CFG = {
  rack:         { url: rackUrl,          rotY: Math.PI,     scaleMul: 1.0 },
  'ups-host':   { url: upsHostUrl,       rotY: -Math.PI / 2, scaleMul: 1.0 },
  'ups-battery':{ url: upsBatteryUrl,    rotY: 0,           scaleMul: 1.0 },
  extinguisher: { url: extinguisherUrl, rotY: 0,           scaleMul: 1.0 },
  door:         { url: doorUrl,          rotY: 0,           scaleMul: 1.0 },
  ac:           { url: acUrl,            rotY: 0,           scaleMul: 1.0 },
  console:      { url: deskUrl,          rotY: 0,           scaleMul: 1.0 },
  'cam-01':     { url: cameraUrl,        rotY: -Math.PI * 1.25, rotX: Math.PI, scaleMul: 1.0, wallMount: true }
}

// 通用设备 GLB 加载：等比缩放到目标高度（floor 落地 / wallMount 居中于 group 原点），
// 水平居中、设 hitMesh；加载失败时降级为占位 Box（保持原可点击命中）。
function loadDeviceGLB(url, group, device, cfg) {
  const targetH = device.size.height
  const scaleMul = cfg.scaleMul ?? 1
  const rotX = cfg.rotX ?? 0
  const rotY = cfg.rotY ?? 0
  const rotZ = cfg.rotZ ?? 0
  const wallMount = !!cfg.wallMount
  gltfLoader.load(
    url,
    (gltf) => {
      const model = gltf.scene
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true
          o.receiveShadow = true
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => {
            if (!m) return
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace
            if (cfg.opacity != null) {
              m.transparent = true
              m.opacity = cfg.opacity
            }
          })
        }
      })
      // 等比缩放使模型高度约等于设备逻辑高度
      let box = new THREE.Box3().setFromObject(model)
      let size = box.getSize(new THREE.Vector3())
      const scale = (targetH / (size.y || 1)) * scaleMul
      model.scale.setScalar(scale)
      box = new THREE.Box3().setFromObject(model)
      size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      if (wallMount) model.position.y -= center.y // 壁装：模型中心对齐 group 原点（group 已抬到 mountY）
      else model.position.y -= box.min.y // 脚底落地 y=0
      // 旋转顺序 YXZ：先绕世界 Y 偏航（水平转，方向不受翻转影响），再绕 X 翻转（倒立）
      model.rotation.order = 'YXZ'
      model.rotation.set(rotX, rotY, rotZ)
      group.add(model)
      group.userData.hitMesh = model
      group.userData.glbLoaded = true
    },
    undefined,
    (err) => {
      console.error('设备 GLB 加载失败，降级占位 Box:', url, err)
      fallbackBox(group, device)
    }
  )
}

// 设备 GLB 加载失败时的占位 Box（保留尺寸/可点击，避免设备凭空消失）
function fallbackBox(group, device) {
  const { width, depth, height } = device.size
  const geo = new THREE.BoxGeometry(width, height, depth)
  const mat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, metalness: 0.3 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = height / 2
  mesh.castShadow = true
  group.add(mesh)
  group.userData.hitMesh = mesh
  originalColors.set(mesh.uuid, mat.color.clone())
}

// 机柜「拉长」参数：仅把机柜增高（宽/深保持设备逻辑尺寸不变），
// 这样内腔被撑高，刀片服务器等设备得以层层放入其内部空间。
const RACK_TALLER = 1.2            // 在原有高度基础上至少拉高 20%
const RACK_MIN_HEIGHT = 2.0        // 服务器机柜不应矮于 2.0m（标准 42U 机柜约 2m）
const RACK_MAX_HEIGHT = WALL_HEIGHT - 0.2  // 不超过吊顶

// 机柜专用加载：非等比缩放（宽/深按设备逻辑尺寸，高按「拉长」后的目标高度），
// 从而单独把机柜增高、把内腔撑高，刀片服务器等设备得以落入其内部空间。
function loadRackGLB(url, group, device, cfg) {
  const targetW = device.size.width
  const targetD = device.size.depth
  const targetH = device.size.height
  const scaleMul = cfg.scaleMul ?? 1
  const rotX = cfg.rotX ?? 0
  const rotY = cfg.rotY ?? 0
  const rotZ = cfg.rotZ ?? 0
  gltfLoader.load(
    url,
    (gltf) => {
      const model = gltf.scene
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true
          o.receiveShadow = true
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => {
            if (!m) return
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace
            if (cfg.opacity != null) {
              m.transparent = true
              m.opacity = cfg.opacity
            }
          })
        }
      })
      let box = new THREE.Box3().setFromObject(model)
      let size = box.getSize(new THREE.Vector3())
      // 非等比：宽/深匹配设备逻辑尺寸，高匹配「拉长」后的目标高度
      model.scale.set(
        (targetW / (size.x || 1)) * scaleMul,
        (targetH / (size.y || 1)) * scaleMul,
        (targetD / (size.z || 1)) * scaleMul
      )
      box = new THREE.Box3().setFromObject(model)
      size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= box.min.y // 脚底落地 y=0
      model.rotation.order = 'YXZ'
      model.rotation.set(rotX, rotY, rotZ)
      group.add(model)
      group.userData.hitMesh = model
      group.userData.glbLoaded = true
    },
    undefined,
    (err) => {
      console.error('机柜 GLB 加载失败，降级占位 Box:', url, err)
      fallbackBox(group, device)
    }
  )
}

function buildRack(group, device, statusColor) {
  // 用「机柜(无隔板).glb」精模替换原 Box 占位外壳（异步加载，失败降级占位 Box）
  // 把机柜「拉长」(仅增高)，让内部有充足竖向空间容纳刀片服务器等设备；
  // 同时把增高后的尺寸用于内部设备堆叠，使刀片服务器落在新撑高的内腔里。
  // 只有需要展示内部设备的 3 个目标机柜设为半透明，其余机柜保持不透明
  const tallHeight = Math.min(
    Math.max(device.size.height * RACK_TALLER, RACK_MIN_HEIGHT),
    RACK_MAX_HEIGHT
  )
  const tallDevice = { ...device, size: { ...device.size, height: tallHeight } }
  const rackCfg = RACK_LAYOUT[device.id] ? { ...GLB_CFG.rack, opacity: 0.4 } : GLB_CFG.rack
  loadRackGLB(rackUrl, group, tallDevice, rackCfg)
  fillRackInternals(group, tallDevice)
}

function buildUps(group, device, statusColor) {
  if (device.id === 'ups-battery') {
    // 用「UPS电池组.glb」替换原电池模块堆积简模
    loadDeviceGLB(upsBatteryUrl, group, device, GLB_CFG['ups-battery'])
    return
  }
  // 用「UPS主机.glb」替换原 Box 占位外壳
  loadDeviceGLB(upsHostUrl, group, device, GLB_CFG['ups-host'])
}

function buildConsole(group, device, statusColor) {
  const { width, depth, height } = device.size

  // 用「电脑桌.glb」精模替换原 Box 占位外壳（异步加载，失败降级占位 Box）
  // 桌面等比缩放到设备逻辑高度（脚底落地 y=0、水平居中），保留贴图色彩空间与可点击命中。
  loadDeviceGLB(deskUrl, group, device, GLB_CFG.console)

  // 显示器：置于桌面上、朝向室内(+z)、向后微倾，避免穿入后墙
  // const standGeo = new THREE.BoxGeometry(0.08, 0.2, 0.08)
  // const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.3 })
  // const stand = new THREE.Mesh(standGeo, standMat)
  // stand.position.set(0, height + 0.1, -depth * 0.12)
  // group.add(stand)

  // const screenGeo = new THREE.BoxGeometry(width * 0.7, 0.45, 0.05)
  // const screenMat = new THREE.MeshStandardMaterial({
  //   map: T.screen,
  //   emissive: 0x38bdf8,
  //   emissiveMap: T.screen,
  //   emissiveIntensity: 0.6,
  //   roughness: 0.3
  // })
  // const screen = new THREE.Mesh(screenGeo, screenMat)
  // screen.position.set(0, height + 0.42, -depth * 0.12)
  // screen.rotation.x = -0.12
  // group.add(screen)

  // const keyboardGeo = new THREE.BoxGeometry(width * 0.5, 0.04, depth * 0.3)
  // const keyboardMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
  // const keyboard = new THREE.Mesh(keyboardGeo, keyboardMat)
  // keyboard.position.set(0, height + 0.06, depth * 0.1)
  // group.add(keyboard)

  // const edgeGeo = new THREE.BoxGeometry(width + 0.02, 0.04, depth + 0.02)
  // const edgeMat = new THREE.MeshBasicMaterial({ color: statusColor, transparent: true, opacity: 0.5 })
  // const edge = new THREE.Mesh(edgeGeo, edgeMat)
  // edge.position.y = 0.04
  // group.add(edge)
}

function buildExtinguisher(group, device) {
  // 用「灭火器.glb」替换原圆柱占位
  loadDeviceGLB(extinguisherUrl, group, device, GLB_CFG.extinguisher)
}

function buildDoor(group, device) {
  // 用「防火门 双扇.glb」替换原 Box 占位外壳
  loadDeviceGLB(doorUrl, group, device, GLB_CFG.door)
}

function buildAc(group, device, statusColor) {
  const { width, depth, height } = device.size

  // 靠左墙（x=-4.5），并旋转 90° 使模型正面/出风口朝向室内（+x 方向）
  group.rotation.y = Math.PI / 2

  // 状态指示灯：贴在正面（+z 局部）右下角，随设备状态变色（danger 时为红）
  const ledGeo = new THREE.CircleGeometry(0.025, 16)
  const ledMat = new THREE.MeshBasicMaterial({ color: statusColor })
  const led = new THREE.Mesh(ledGeo, ledMat)
  led.position.set(width * 0.3, height * 0.12, depth / 2 + 0.012)
  group.add(led)

  // 出风口气流粒子（模拟时断时续送风）：从面板上半部 +z 面向室内斜向下吹出
  const windGroup = new THREE.Group()
  const outletStartZ = depth / 2 + 0.03 // 出风口在面板外缘
  const outletY = height * 0.85 // 出风口置于上半部
  const reach = 1.3 // 气流向外（+z 局部）吹送距离
  const drop = 0.55 // 向下吹送落差
  const side = 0.35 // 向室内右侧（+x 局部 = 房间右向）偏移，形成斜向
  const windMat = new THREE.MeshBasicMaterial({
    color: 0xbfe9ff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false
  })
  const windStreakGeo = new THREE.BoxGeometry(0.05, 0.03, 0.18)
  // 让气流条纹沿「向外+向下+向右」的斜向对齐
  const tiltX = Math.atan2(drop, reach)
  const tiltY = Math.atan2(side, reach)
  const streakCount = 7
  for (let i = 0; i < streakCount; i++) {
    const m = new THREE.Mesh(windStreakGeo, windMat.clone())
    const xSpan = (i / (streakCount - 1) - 0.5) * width * 0.7 // 横向铺开
    m.rotation.set(tiltX, tiltY, 0)
    m.position.set(xSpan, 0, 0)
    windGroup.add(m)
    acWinds.push({
      mesh: m,
      startZ: outletStartZ,
      baseY: outletY,
      baseX: xSpan,
      reach,
      drop,
      side,
      speed: 0.5 + Math.random() * 0.25,
      phase: Math.random()
    })
  }
  group.add(windGroup)

  // 用 GLB 精模替换原来的 Box 外壳（异步加载，加载完成前先用占位箱体兜底）
  group.userData.hitMesh = led
  loadAcModel(group, width, depth, height)
}

// 空调 GLB 精模加载：等比缩放至设备逻辑高度，水平居中、脚底落地，正面朝局部 +z（经 group 旋转后朝室内）
const AC_MODEL_ROT_Y = 0 // 若模型正面朝向不符（如背对/侧对室内），改此角度（0 / ±π/2 / π）即可
function loadAcModel(group, width, depth, height) {
  gltfLoader.load(
    acUrl,
    (gltf) => {
      const model = gltf.scene
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true
          o.receiveShadow = true
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => { if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace })
        }
      })
      // 等比缩放使模型高度约等于设备逻辑高度 1.5m；再做水平居中、脚底落地
      let box = new THREE.Box3().setFromObject(model)
      let size = box.getSize(new THREE.Vector3())
      const scale = height / (size.y || 1)
      model.scale.setScalar(scale)
      box = new THREE.Box3().setFromObject(model)
      size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= box.min.y // 脚底落在地面 y=0
      model.rotation.y = AC_MODEL_ROT_Y
      group.add(model)
      group.userData.hitMesh = model
    },
    undefined,
    (err) => {
      console.error('空调 GLB 模型加载失败，降级为占位箱体:', err)
      const shellMat = new THREE.MeshStandardMaterial({ map: T.ac, color: 0xffffff, roughness: 0.5, metalness: 0.15 })
      const panelMat = new THREE.MeshStandardMaterial({ map: T.acPanel, color: 0xffffff, roughness: 0.4, metalness: 0.1 })
      const matArray = [shellMat, shellMat, shellMat, shellMat, panelMat, shellMat]
      const geo = new THREE.BoxGeometry(width, height, depth)
      const mesh = new THREE.Mesh(geo, matArray)
      mesh.position.y = height / 2
      mesh.castShadow = true
      group.add(mesh)
      group.userData.hitMesh = mesh
      originalColors.set(mesh.uuid, shellMat.color.clone())
    }
  )
}

function buildCamera(group, device, statusColor) {
  const mountY = device.mountY ?? (WALL_HEIGHT - 0.35)
  // 摄像头为壁装，整体抬高到 mountY（常规设备贴地，故此处单独设置 y）
  group.position.set(device.position.x, mountY, device.position.z)
  // 用「半球摄像头.glb」替换原枪机占位（壁装：模型中心对齐 mountY 处）
  loadDeviceGLB(cameraUrl, group, device, GLB_CFG['cam-01'])
}

function buildSensor(group, device, statusColor) {
  const { width, depth, height } = device.size
  const mountY = device.mountY ?? (WALL_HEIGHT - 0.4)
  // 壁装：整体抬高到 mountY（常规设备贴地，此处单独设置 y）
  group.position.set(device.position.x, mountY, device.position.z)

  // 壁装底板（贴墙，位于 -z 一侧）
  const plateGeo = new THREE.BoxGeometry(width + 0.04, height + 0.04, 0.02)
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, metalness: 0.3 })
  const plate = new THREE.Mesh(plateGeo, plateMat)
  plate.position.set(0, 0, -depth / 2 - 0.01)
  group.add(plate)

  // 白色塑料主体
  const bodyGeo = new THREE.BoxGeometry(width, height, depth)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, metalness: 0.05 })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.castShadow = true
  group.add(body)
  group.userData.hitMesh = body
  originalColors.set(body.uuid, bodyMat.color.clone())

  // 正面 LCD 屏（朝 +z 室内方向）
  const screenGeo = new THREE.PlaneGeometry(width * 0.82, height * 0.7)
  const screenMat = new THREE.MeshBasicMaterial({ map: T.sensorScreen })
  const screen = new THREE.Mesh(screenGeo, screenMat)
  screen.position.set(0, 0, depth / 2 + 0.001)
  group.add(screen)

  // 运行状态指示灯（绿色）
  const ledGeo = new THREE.SphereGeometry(0.012, 10, 10)
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x22c55e })
  const led = new THREE.Mesh(ledGeo, ledMat)
  led.position.set(width * 0.32, -height * 0.42, depth / 2 + 0.006)
  group.add(led)
}

function buildSmoke(group, device, statusColor) {
  const { width, depth, height } = device.size
  const mountY = device.mountY ?? (WALL_HEIGHT - 0.4)
  // 壁装：整体抬高到 mountY（与温湿度传感器同高度、紧邻布置）
  group.position.set(device.position.x, mountY, device.position.z)

  const r = width * 0.5

  // 壁装底板（贴墙，位于 -z 一侧）
  const plateGeo = new THREE.BoxGeometry(width + 0.04, height + 0.04, 0.02)
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, metalness: 0.3 })
  const plate = new THREE.Mesh(plateGeo, plateMat)
  plate.position.set(0, 0, -depth / 2 - 0.01)
  group.add(plate)

  // 白色圆形探测盘（圆柱沿 z 轴，圆形面朝向室内 +z）
  const bodyGeo = new THREE.CylinderGeometry(r, r, depth, 32)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55, metalness: 0.05 })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.rotation.x = Math.PI / 2
  body.castShadow = true
  group.add(body)
  group.userData.hitMesh = body
  originalColors.set(body.uuid, bodyMat.color.clone())

  // 中央采样窗（略凹的浅灰圆盘，模拟进烟格栅）
  const winGeo = new THREE.CylinderGeometry(r * 0.55, r * 0.55, depth * 0.4, 24)
  const winMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8, metalness: 0.05 })
  const win = new THREE.Mesh(winGeo, winMat)
  win.rotation.x = Math.PI / 2
  win.position.set(0, 0, depth / 2)
  group.add(win)

  // 状态指示灯（随设备状态变色，正常为绿色）
  const ledGeo = new THREE.SphereGeometry(0.014, 12, 12)
  const ledMat = new THREE.MeshBasicMaterial({ color: statusColor === 0x38bdf8 ? 0x22c55e : statusColor })
  const led = new THREE.Mesh(ledGeo, ledMat)
  led.position.set(r * 0.55, -r * 0.55, depth / 2 + 0.005)
  group.add(led)

  // 报警红光（闪烁，模拟烟感报警指示），置于对角位置
  const alarmGeo = new THREE.SphereGeometry(0.016, 12, 12)
  const alarmMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 1 })
  const alarmLed = new THREE.Mesh(alarmGeo, alarmMat)
  alarmLed.position.set(-r * 0.55, r * 0.55, depth / 2 + 0.006)
  group.add(alarmLed)
  smokeLeds.push(alarmLed)
}

function addLabel(group, device) {
  const div = document.createElement('div')
  div.className = 'device-label'
  const inner = document.createElement('div')
  inner.className = 'device-label-inner'
  inner.textContent = device.name
  div.appendChild(inner)

  const label = new CSS2DObject(div)
  // 壁装设备（摄像头/传感器/烟感）已抬高到 mountY，标签放在机身下方避免飘出天花板
  const isWall = device.type === 'camera' || device.type === 'sensor' || device.type === 'smoke'
  const labelY = isWall ? -0.35 : device.size.height + 0.25
  // 摄像头为半球贴墙安装（机身紧贴后/右墙），若标签落在机身正下方仍会盖住模型本体；
  // 故向室内(+z)方向偏移，使标签悬于摄像头前下方、明显离开模型轮廓，不再遮挡。
  const labelZ = device.type === 'camera' ? 0.34 : 0
  label.position.set(0, labelY, labelZ)
  group.add(label)
}

// 将中央展示模型（GLB）载入机房正中：自动居中、落地、等比缩放到约 1.7m，
// 随后把走路 / 待机 / 转身 三个 FBX 动作重定向到该人物上并启动巡逻
function loadCenterModel() {
  const loader = new FBXLoader()
  loader.load(
    charModelUrl,
    (model) => {
      // 开启阴影，并修正贴图色彩空间（避免发灰）
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true
          o.receiveShadow = true
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => {
            if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace
          })
        }
      })

      // FBX 通常是厘米制（人物约 170 单位高），按包围盒等比缩放到约 1.7m，
      // 并水平居中、脚底落地（机房净高 3m）
      let box = new THREE.Box3().setFromObject(model)
      let size = box.getSize(new THREE.Vector3())
      const targetHeight = 1.7
      const scale = targetHeight / (size.y || 1)
      model.scale.setScalar(scale)

      box = new THREE.Box3().setFromObject(model)
      size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= box.min.y // 脚底落在地面 y=0

      scene.add(model)
      centerModel = model

      // 人物朝向由下面的巡逻状态机动态控制，故此处不再写死 rotation.y
      setupCharacterAnimation(model)
    },
    undefined,
    (err) => {
      console.error('中央人物(FBX)加载失败:', err)
    }
  )
}

// ---------- 人物动画：FBX 动作直接套用到同骨架人物 ----------

// 找出骨骼最多（最完整）的 SkinnedMesh 作为重定向目标 / 来源
function findSkinnedMesh(root) {
  let best = null
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones.length) {
      if (!best || o.skeleton.bones.length > best.skeleton.bones.length) best = o
    }
  })
  return best
}

// 按"去掉尾部 _数字 / _end / _tip"的基础名查找骨骼（Mixamo 末端骨为 Head_end 等）
function findBoneByBase(root, baseName) {
  let found = null
  root.traverse((o) => {
    if (!found && o.isBone && o.name.replace(/_(end|tip|\d+)$/, '') === baseName) found = o
  })
  return found
}

// 把动画片段清洗为「仅旋转」：保留 .quaternion 轨道（轨道名即骨骼名，
// 与人物骨架同名，可直接按名绑定到人物骨骼），丢弃 .position / .scale 轨道。
// 丢弃位移轨道的原因：这些 FBX 是厘米制、且含根运动(root motion)；
// 若保留会把厘米级位移叠加到我们按米制缩放好的人物上，导致脚滑 / 瞬移。
// 仅旋转轨道即可让人物在椭圆巡逻中「原地走 / 转身」，整体位置由状态机控制。
function cleanClip(clip) {
  const tracks = clip.tracks
    .filter((t) => t.name.endsWith('.quaternion'))
    .map((t) => new THREE.QuaternionKeyframeTrack(t.name, t.times, t.values))
  return new THREE.AnimationClip(clip.name, -1, tracks)
}

function loadFbx(url) {
  return new Promise((resolve, reject) => {
    new FBXLoader().load(url, resolve, undefined, reject)
  })
}

// 释放 FBX 占用的网格/贴图/几何体（只借用它的骨架做重定向，不需要它入场景）
function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []
    mats.forEach((m) => {
      if (!m) return
      Object.keys(m).forEach((k) => {
        if (m[k] && m[k].isTexture) m[k].dispose()
      })
      m.dispose()
    })
  })
}

// 动画重定向失败时，退化为播放 GLB 自带动画、静立在机房正中
function fallbackToOwnClips(model, clips) {
  model.position.x = 0
  model.position.z = 0
  model.rotation.y = Math.PI
  if (clips && clips.length) {
    centerMixer = new THREE.AnimationMixer(model)
    centerMixer.clipAction(clips[0]).play()
  }
}

async function setupCharacterAnimation(model) {
  const targetSkinned = findSkinnedMesh(model)
  if (!targetSkinned) {
    // 人物 FBX 无骨骼时无法承载骨骼动画，退化为「整体运动巡逻」
    console.warn('人物模型无 SkinnedMesh，启用整体运动巡逻（无骨骼肢体动画）')
    startPatrol(model)
    return
  }

  try {
    const [walkFbx, idleFbx, turnFbx] = await Promise.all([
      loadFbx(walkFbxUrl),
      loadFbx(idleFbxUrl),
      loadFbx(turnFbxUrl)
    ])
    if (!walkFbx.animations.length || !idleFbx.animations.length || !turnFbx.animations.length) {
      throw new Error('动画 FBX 中未找到动画片段')
    }

    // 人物与动画 FBX 是同一套 Mixamo 骨架（骨骼名一致），动画片段可直接套用：
    // 仅保留 .quaternion 轨道，按骨骼名自动绑定到人物身上（见 cleanClip）。
    charClips.walk = cleanClip(walkFbx.animations[0])
    charClips.idle = cleanClip(idleFbx.animations[0])
    charClips.turn = cleanClip(turnFbx.animations[0])

    // 组件可能已卸载 / 模型已换掉
    if (centerModel !== model) return

    ;[walkFbx, idleFbx, turnFbx].forEach(disposeTree)
    startPatrol(model)
  } catch (err) {
    console.error('人物动画 FBX 加载或套用失败，回退为整体运动巡逻:', err)
    startPatrol(model)
  }
}

// ---------- 人物动画：巡逻状态机 ----------

// 用左右脚在世界空间的位置推算人物前向，避免依赖任何骨骼命名/轴向约定。
// 左脚 → 右脚 即人物右向；前向 = 上 × 右
function measureFacingYaw(model) {
  const left = findBoneByBase(model, 'LeftFoot')
  const right = findBoneByBase(model, 'RightFoot')
  if (!left || !right) return 0
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  left.getWorldPosition(a)
  right.getWorldPosition(b)
  const rightDir = b.sub(a).setY(0)
  if (rightDir.lengthSq() < 1e-10) return 0
  const facing = new THREE.Vector3().crossVectors(UP_AXIS, rightDir.normalize())
  return Math.atan2(facing.x, facing.z)
}

function normalizeAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

// 由"根节点未旋转时的前向角"，反推出让人物朝向某个行进方向所需的根节点偏航
function yawForDirection(dir) {
  const desired = dir > 0 ? Math.PI / 2 : -Math.PI / 2 // +1 朝 +x（空调→对向墙面）
  return normalizeAngle(desired - facingBaseYaw + FACING_OFFSET)
}

// 椭圆上的世界坐标（仅算 x/z，人物 y 由 loadCenterModel 落地保持）
function ellipsePos(theta) {
  return {
    x: PATROL.cx + PATROL.radiusX * Math.cos(theta),
    z: PATROL.cz + PATROL.radiusZ * Math.sin(theta)
  }
}
// θ 处、沿前进方向(dir=+1 增大 / -1 减小)的世界前向 yaw：让人物 +z 对齐椭圆切线
function tangentYawAt(theta, dir) {
  const dx = -PATROL.radiusX * Math.sin(theta)
  const dz = PATROL.radiusZ * Math.cos(theta)
  const v = new THREE.Vector3(dx, 0, dz).multiplyScalar(dir)
  v.y = 0
  if (v.lengthSq() < 1e-12) return 0
  v.normalize()
  return Math.atan2(v.x, v.z)
}
// 当前切线速率 |dp/dθ|，用于把线速度换算为角速度，使沿椭圆匀速行走
function tangentSpeed(theta) {
  return Math.hypot(-PATROL.radiusX * Math.sin(theta), PATROL.radiusZ * Math.cos(theta))
}

function startPatrol(model) {
  // 有骨骼 + 已重定向出动作片段时，建立 AnimationMixer；否则为纯运动巡逻（charActions=null）
  centerMixer = charClips.walk ? new THREE.AnimationMixer(model) : null
  if (centerMixer) {
    charActions = {
      walk: centerMixer.clipAction(charClips.walk),
      idle: centerMixer.clipAction(charClips.idle),
      turn: centerMixer.clipAction(charClips.turn)
    }
    charActions.walk.setLoop(THREE.LoopRepeat, Infinity)
    charActions.idle.setLoop(THREE.LoopRepeat, Infinity)
    charActions.turn.setLoop(THREE.LoopOnce, 1)
    charActions.turn.clampWhenFinished = true // 转身播完保持末帧，便于交叉淡出
  }

  // 就位于椭圆起始角（保留落地用的 y，只改 x / z）
  patrolTheta = PATROL.theta0
  patrolAccum = 0
  const p0 = ellipsePos(patrolTheta)
  model.position.x = p0.x
  model.position.z = p0.z

  // 根节点先不旋转，借行走首帧量出人物的天然前向角（有骨架时有效，无骨架为 0）
  model.rotation.y = 0
  if (centerMixer) {
    charActions.walk.play()
    currentAction = charActions.walk
    centerMixer.update(0)
  }
  model.updateMatrixWorld(true)
  facingBaseYaw = measureFacingYaw(model)

  // 起始：在椭圆起点待机，面朝前进切线方向
  walkDir = 1
  setState(CHAR_STATE.IDLE)
}

function crossfadeTo(name) {
  const next = charActions && charActions[name]
  if (!next || currentAction === next) return
  next.reset()
  next.play()
  if (currentAction) currentAction.crossFadeTo(next, PATROL.fadeSeconds, false)
  currentAction = next
}

function setState(next) {
  charState = next
  stateTime = 0
  if (next === CHAR_STATE.WALK) {
    if (charActions) crossfadeTo('walk')
    rootYaw = tangentYawAt(patrolTheta, walkDir) - facingBaseYaw + FACING_OFFSET
  } else if (next === CHAR_STATE.IDLE) {
    // 待机时即保持下一段行走的朝向（转身后的补偿值与此处算得的值一致，故无跳变）
    if (charActions) crossfadeTo('idle')
    rootYaw = tangentYawAt(patrolTheta, walkDir) - facingBaseYaw + FACING_OFFSET
  } else if (next === CHAR_STATE.TURN) {
    if (charActions) crossfadeTo('turn')
    turnFaded = false
  }
}

function startRootRamp(delta, dur) {
  rootRamp = { from: rootYaw, delta, time: 0, dur }
}

function updateRootRamp(dt) {
  if (!rootRamp) return
  rootRamp.time += dt
  const u = Math.min(1, rootRamp.time / rootRamp.dur)
  rootYaw = rootRamp.from + rootRamp.delta * u
  if (u >= 1) {
    rootYaw = normalizeAngle(rootYaw)
    rootRamp = null
  }
}

// 每帧推进：待机 → 沿椭圆走到一整圈 → 转身 → 待机 → 反向沿椭圆走回 → 转身 ……
function updateCharacter(dt) {
  if (!centerModel) return

  stateTime += dt

  if (charState === CHAR_STATE.IDLE) {
    if (stateTime >= PATROL.idleSeconds) setState(CHAR_STATE.WALK)
  } else if (charState === CHAR_STATE.WALK) {
    // 沿椭圆匀速推进：线速度 → 角速度（保证视觉匀速，不因椭圆曲率忽快忽慢）
    const seg = tangentSpeed(patrolTheta) || 1
    const dTheta = (PATROL.speed * Math.max(dt, 0)) / seg
    patrolTheta += walkDir * dTheta
    patrolAccum += dTheta
    const p = ellipsePos(patrolTheta)
    centerModel.position.x = p.x
    centerModel.position.z = p.z
    rootYaw = tangentYawAt(patrolTheta, walkDir) - facingBaseYaw + FACING_OFFSET
    if (patrolAccum >= PATROL.loopAngle) setState(CHAR_STATE.TURN)
  } else if (charState === CHAR_STATE.TURN) {
    const turnDur = charActions ? charClips.turn.duration : PATROL.turnSeconds
    // 有骨骼：转身片段自身已转过约 180°，此时才把这 180° 补到根节点并淡出到待机，
    // 两者同步进行、相互抵消，人物不会转满 360°；无骨骼：即整体原地转身 180°。
    if (!turnFaded && stateTime >= turnDur) {
      turnFaded = true
      startRootRamp(TURN_BODY_YAW, charActions ? PATROL.fadeSeconds : PATROL.turnSeconds)
      if (charActions) crossfadeTo('idle')
    }
    if (stateTime >= turnDur + (charActions ? PATROL.fadeSeconds : PATROL.turnSeconds)) {
      walkDir *= -1
      patrolAccum = 0
      setState(CHAR_STATE.IDLE)
    }
  }

  updateRootRamp(dt)
  centerModel.rotation.y = rootYaw
  if (centerMixer) centerMixer.update(dt)
}

// 在告警/故障设备上方标记一个向下指示的 3D 箭头（颜色与状态一致），并记录基准高度用于浮动动画
function addStatusArrow(group, device, statusColor, deviceId) {
  const { width, depth, height } = device.size
  const isWallMount = device.type === 'camera' || device.type === 'sensor' || device.type === 'smoke'
  // 壁装设备机体中心在 group 原点（mountY），地板设备机体底部在 group 原点、顶部在 height
  const topLocalY = isWallMount ? (height / 2) : height
  const baseY = topLocalY + 0.4

  const arrowGroup = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: statusColor,
    emissive: statusColor,
    emissiveIntensity: 0.6,
    roughness: 0.35,
    metalness: 0.2
  })

  // 箭头杆（圆柱）
  const shaftH = 0.24
  const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, shaftH, 16)
  const shaft = new THREE.Mesh(shaftGeo, mat)
  shaft.position.y = shaftH / 2  // 杆在上方

  // 箭头头部（圆锥，朝下）
  const headH = 0.16
  const headGeo = new THREE.ConeGeometry(0.1, headH, 20)
  const head = new THREE.Mesh(headGeo, mat)
  head.rotation.x = Math.PI        // 尖端朝下
  head.position.y = -headH / 2     // 头部在下方

  arrowGroup.add(shaft)
  arrowGroup.add(head)
  arrowGroup.position.set(0, baseY, 0)
  group.add(arrowGroup)

  statusArrows.push({
    obj: arrowGroup,
    baseY,
    phase: Math.random() * Math.PI * 2,
    deviceId
  })
}

// 依据实时状态(liveStatus)与静态状态，同步告警/故障 3D 箭头：
// 新增进入告警/故障的设备箭头，移除已恢复正常的设备箭头
function syncStatusMarkers() {
  const liveStatus = store.state.realtime.liveStatus || {}
  const desired = new Set()
  devices.forEach(d => {
    const st = liveStatus[d.id] || d.status
    if (st === 'warning' || st === 'danger') desired.add(d.id)
  })

  // 移除多余箭头
  for (let i = statusArrows.length - 1; i >= 0; i--) {
    const a = statusArrows[i]
    if (!desired.has(a.deviceId)) {
      if (a.obj.parent) a.obj.parent.remove(a.obj)
      statusArrows.splice(i, 1)
    }
  }

  // 补建缺失箭头
  devices.forEach(d => {
    const st = liveStatus[d.id] || d.status
    if ((st === 'warning' || st === 'danger') && !statusArrows.find(a => a.deviceId === d.id)) {
      const group = deviceMeshes.find(g => g.userData.device && g.userData.device.id === d.id)
      if (group) addStatusArrow(group, d, getStatusColor(st), d.id)
    }
  })
}

// 机柜间线缆：配电柜→服务器/网络机柜（供电），网络机柜→服务器（弱电传输），含流动光点动画
function addCables() {
  const cableGroup = new THREE.Group()
  const getDev = (id) => devices.find(d => d.id === id)
  const powerCab = getDev('rack-power')
  const netCab = getDev('rack-network')
  const server1 = getDev('rack-server-1')
  const server2 = getDev('rack-server-2')

  // 线缆接在机柜后侧、z 略大于机柜后沿避免穿模
  // 供电线置于机柜下半部，弱电线置于上半部，上下分开；同类型内按长度排序：长的在下、短的在上
  const zOff = 0.55
  const port = (dev, y) => new THREE.Vector3(dev.position.x, y, dev.position.z + zOff)
  const lenOf = (s, d) => Math.abs(d.position.x - s.position.x)

  // 供电线：配电柜 -> 服务器1 / 服务器2 / 网络机柜（暖色流动，机柜下半部）
  const powerLinks = [
    [powerCab, server1],
    [powerCab, server2],
    [powerCab, netCab]
  ]
  const powerStep = 0.13
  const powerBaseY = 0.55
  powerLinks
    .map(([s, d]) => ({ s, d, len: lenOf(s, d) }))
    .sort((a, b) => b.len - a.len) // 长的在下
    .forEach((link, i) => {
      const y = powerBaseY + i * powerStep
      buildCable(cableGroup, port(link.s, y), port(link.d, y), {
        baseColor: 0x475569,
        flowColor: 0xfbbf24,
        speed: 0.22,
        count: 3
      })
    })

  // 弱电传输线：网络机柜 -> 服务器1 / 服务器2（冷色流动，速度更快，机柜上半部）
  const netLinks = [
    [netCab, server1],
    [netCab, server2]
  ]
  const netStep = 0.13
  const netBaseY = 1.5
  netLinks
    .map(([s, d]) => ({ s, d, len: lenOf(s, d) }))
    .sort((a, b) => b.len - a.len) // 长的在下
    .forEach((link, i) => {
      const y = netBaseY + i * netStep
      buildCable(cableGroup, port(link.s, y), port(link.d, y), {
        baseColor: 0x1d4ed8,
        flowColor: 0x22d3ee,
        speed: 0.38,
        count: 4
      })
    })

  scene.add(cableGroup)
}

// 构建单根垂坠线缆（二次贝塞尔曲线 + 管壁），并生成沿曲线流动的光点
function buildCable(parent, start, end, opts) {
  const mid = new THREE.Vector3(
    (start.x + end.x) / 2,
    Math.min(start.y, end.y) - 0.35, // 中间下垂
    (start.z + end.z) / 2
  )
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
  const tubeGeo = new THREE.TubeGeometry(curve, 48, 0.03, 8, false)
  const tubeMat = new THREE.MeshStandardMaterial({
    color: opts.baseColor,
    roughness: 0.6,
    metalness: 0.2,
    emissive: opts.baseColor,
    emissiveIntensity: 0.12
  })
  const tube = new THREE.Mesh(tubeGeo, tubeMat)
  parent.add(tube)

  const pulseGeo = new THREE.SphereGeometry(0.05, 12, 12)
  const pulses = []
  for (let i = 0; i < opts.count; i++) {
    const pMat = new THREE.MeshBasicMaterial({ color: opts.flowColor })
    const p = new THREE.Mesh(pulseGeo, pMat)
    parent.add(p)
    pulses.push({ mesh: p, offset: i / opts.count })
  }

  cables.push({ curve, pulses, speed: opts.speed })
}

function getHitObjects() {
  return deviceMeshes.map(g => g.userData.hitMesh).filter(Boolean)
}

// 从被射线击中的子网格向上回溯到带 userData.device 的设备 Group
function findDeviceGroup(obj) {
  let o = obj
  while (o) {
    if (o.userData && o.userData.device) return o
    o = o.parent
  }
  return null
}

function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects(getHitObjects())
  renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default'
}

function onClick(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects(getHitObjects())

  if (intersects.length > 0) {
    // 机柜内子设备（_rackSlot）位于半透明柜体之后，射线会同时命中柜体与内部设备；
    // 内部设备应优先被选中（避免穿过玻璃柜体却只选到柜子）。
    let internalSel = null
    let fallback = null
    for (const it of intersects) {
      const grp = findDeviceGroup(it.object)
      const dev = grp && grp.userData.device
      if (!dev) continue
      const server = it.object.userData.serverIndex
        ? { index: it.object.userData.serverIndex, total: it.object.userData.totalServers }
        : null
      if (dev._rackSlot && !internalSel) internalSel = { grp, dev, server }
      else if (!fallback) fallback = { grp, dev, server }
    }
    const pick = internalSel || fallback
    if (pick) {
      store.dispatch('selectDevice', { device: pick.dev, server: pick.server })
      highlightSelection(pick.grp)
      return
    }
  }
  store.dispatch('clearDevice')
  clearHighlights()
}

// 高亮整台设备（GLB 模型为 Group，遍历其所有子网格设置自发光）
const highlightStore = new Map()
function highlightSelection(group) {
  clearHighlights()
  const root = group && group.userData.hitMesh
  if (!root) return
  root.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach((m) => {
      if (m && m.emissive) {
        highlightStore.set(m.uuid, { mat: m, hex: m.emissive.getHex(), intensity: m.emissiveIntensity ?? 0 })
        m.emissive.setHex(0x38bdf8)
        m.emissiveIntensity = 0.5
      }
    })
  })
}

function clearHighlights() {
  highlightStore.forEach((v) => {
    if (v.mat && v.mat.emissive) {
      v.mat.emissive.setHex(v.hex)
      v.mat.emissiveIntensity = v.intensity
    }
  })
  highlightStore.clear()
}

function onResize() {
  if (!container.value) return
  camera.aspect = container.value.clientWidth / container.value.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(container.value.clientWidth, container.value.clientHeight)
  labelRenderer.setSize(container.value.clientWidth, container.value.clientHeight)
}

function animate() {
  animationId = requestAnimationFrame(animate)
  controls.update()

  // 中央人物动画（走路 / 待机 / 转身）—— 已注释禁用
  // 限制单帧步长：标签页切到后台再回来时 getDelta 会很大，否则人物会瞬移
  // const dt = Math.min(modelClock.getDelta(), 0.1)
  // if (centerMixer) centerMixer.update(dt)
  // updateCharacter(dt)

  // 状态箭头上下浮动动画
  const t = performance.now() * 0.003
  for (let i = 0; i < statusArrows.length; i++) {
    const a = statusArrows[i]
    a.obj.position.y = a.baseY + Math.sin(t + a.phase) * 0.12
  }

  // 线缆流动光点动画（模拟供电 / 网络传输）
  const tf = performance.now() * 0.001
  for (let i = 0; i < cables.length; i++) {
    const c = cables[i]
    for (let j = 0; j < c.pulses.length; j++) {
      let u = (c.pulses[j].offset + tf * c.speed) % 1
      if (u < 0) u += 1
      c.pulses[j].mesh.position.copy(c.curve.getPointAt(u))
    }
  }

  // 空调出风口气流：时断时续送风动画
  const now = performance.now()
  const blowing = (now % 3000) < 1900 // 约 1.9s 送风 / 1.1s 暂停
  for (let i = 0; i < acWinds.length; i++) {
    const w = acWinds[i]
    const prog = (((now * 0.001 * w.speed) + w.phase) % 1)
    if (blowing) {
      w.mesh.visible = true
      // 右上斜向下：向外(+z) + 向右(+x 局部) + 向下(-y)
      w.mesh.position.z = w.startZ + prog * w.reach
      w.mesh.position.x = w.baseX + prog * w.side
      w.mesh.position.y = w.baseY - prog * w.drop
      w.mesh.material.opacity = Math.sin(prog * Math.PI) * 0.5 // 沿程淡入淡出
    } else {
      w.mesh.visible = false
    }
  }

  // 烟感报警红光闪烁（约 0.45s 一闪）
  const blinkOn = (Math.floor(now / 450) % 2) === 0
  for (let i = 0; i < smokeLeds.length; i++) {
    smokeLeds[i].material.opacity = blinkOn ? 1 : 0.08
  }

  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
}

onMounted(() => {
  init()
  // 实时数据拉取后（realtime.version 自增），同步 3D 状态箭头
  watch(() => store.state.realtime.version, () => {
    syncStatusMarkers()
  })
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  if (renderer.domElement) {
    renderer.domElement.removeEventListener('click', onClick)
    renderer.domElement.removeEventListener('mousemove', onMouseMove)
  }
  renderer.dispose()
})
</script>

<style scoped>
.scene-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.label-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
