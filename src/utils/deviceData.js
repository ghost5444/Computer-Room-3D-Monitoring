export const devices = [
  {
    id: 'rack-backup3',
    name: '备用机柜3',
    type: 'rack',
    position: { x: -2.5, z: 1.5 },
    size: { width: 0.6, depth: 1.5, height: 1.8 },
    color: 0x1e293b,
    status: 'normal',
    info: {
      ip: '10.0.1.101',
      load: '68%',
      temperature: '26℃',
      power: '2.4kW',
      description: '核心业务数据存储机柜'
    }
  },
  {
    id: 'rack-backup2',
    name: '备用机柜2',
    type: 'rack',
    position: { x: -1.6, z: 1.5 },
    size: { width: 0.6, depth: 1.5, height: 1.8 },
    color: 0x1e293b,
    status: 'normal',
    info: {
      ip: '10.0.1.102',
      load: '22%',
      temperature: '24℃',
      power: '1.1kW',
      description: '备用设备机柜，用于灾备切换'
    }
  },
  {
    id: 'rack-backup1',
    name: '备用机柜1',
    type: 'rack',
    position: { x: -0.7, z: 1.5 },
    size: { width: 0.6, depth: 1.5, height: 1.8 },
    color: 0x1e293b,
    status: 'normal',
    info: {
      ip: '10.0.1.103',
      load: '75%',
      temperature: '30℃',
      power: '2.1kW',
      description: '监控与日志采集服务器'
    }
  },
  {
    id: 'rack-power',
    name: '配电柜',
    type: 'rack',
    position: { x: 0.2, z: 1.5 },
    size: { width: 0.6, depth: 1.5, height: 1.8 },
    color: 0x1e293b,
    status: 'normal',
    info: {
      ip: '10.0.1.104',
      load: '82%',
      temperature: '32℃',
      power: '8.5kW',
      description: '机房总配电柜，分路供电控制'
    }
  },
  {
    id: 'rack-server-1',
    name: '服务器机柜',
    type: 'rack',
    position: { x: 1.1, z: 1.5 },
    size: { width: 0.6, depth: 1.5, height: 1.8 },
    color: 0x1e293b,
    status: 'normal',
    info: {
      ip: '10.0.1.105',
      load: '71%',
      temperature: '27℃',
      power: '3.2kW',
      description: '虚拟化与计算节点服务器'
    }
  },
  {
    id: 'rack-server-2',
    name: '服务器机柜',
    type: 'rack',
    position: { x: 2.0, z: 1.5 },
    size: { width: 0.6, depth: 1.5, height: 1.8 },
    color: 0x1e293b,
    status: 'normal',
    info: {
      ip: '10.0.1.106',
      load: '65%',
      temperature: '26℃',
      power: '2.9kW',
      description: '应用服务与中间件服务器'
    }
  },
  {
    id: 'rack-network',
    name: '网络机柜',
    type: 'rack',
    position: { x: 2.9, z: 1.5 },
    size: { width: 0.6, depth: 1.5, height: 1.8 },
    color: 0x1e293b,
    status: 'normal',
    info: {
      ip: '10.0.1.107',
      load: '45%',
      temperature: '25℃',
      power: '1.5kW',
      description: '核心交换机与网络安全设备'
    }
  },
  {
    id: 'ups-battery',
    name: 'UPS电池柜',
    type: 'ups',
    position: { x: -3.2, z: -2.40 },
    size: { width: 1.2, depth: 0.8, height: 1.6 },
    color: 0x0f172a,
    status: 'normal',
      info: {
        ip: '10.0.1.201',
        load: '55%',
        temperature: '23℃',
        power: '20kVA',
        description: 'UPS 后备电池组，续航 30 分钟',
        // 与 UPS主机 共享同一份 UPS 实时信息（电池/输入/输出），详情展示保持一致
        ups: {
          batteryRuntime: '32 分钟',
          batteryCapacity: '12×12V/100Ah',
          internalTemp: '27℃',
          mainsStatus: '正常（市电供电）',
          outputLoad: '48%',
          detail: {
            inputVoltageA: '220V',
            inputVoltageB: '221V',
            inputVoltageC: '219V',
            inputFrequency: '50.0Hz',
            outputVoltage: '220V',
            batteryVoltage: '273V'
          }
        }
      }
  },
  {
    id: 'ups-host',
    name: 'UPS主机',
    type: 'ups',
    position: { x: -1.8, z: -2.52 },
    size: { width: 0.4, depth: 0.8, height: 0.5 },
    color: 0x0f172a,
    status: 'normal',
    info: {
      ip: '10.0.1.202',
      load: '48%',
      temperature: '24℃',
      power: '20kVA',
      description: 'UPS 不间断电源主机',
      ups: {
        batteryRuntime: '32 分钟',
        batteryCapacity: '12×12V/100Ah',
        internalTemp: '27℃',
        mainsStatus: '正常（市电供电）',
        outputLoad: '48%',
        detail: {
          inputVoltageA: '220V',
          inputVoltageB: '221V',
          inputVoltageC: '219V',
          inputFrequency: '50.0Hz',
          outputVoltage: '220V',
          batteryVoltage: '273V'
        }
      }
    }
  },
  {
    id: 'console',
    name: '操作台',
    type: 'console',
    position: { x: 0.2, z: -2.47 },
    size: { width: 2.2, depth: 1.1, height: 1.2 },
    color: 0x1e293b,
    status: 'normal',
    info: {
      ip: '10.0.1.250',
      load: '30%',
      temperature: '22℃',
      power: '0.5kW',
      description: '运维操作台与监控大屏'
    }
  },
  {
    id: 'extinguisher',
    name: '灭火器',
    type: 'extinguisher',
    position: { x: 1.8, z: -2.795 },
    size: { width: 0.25, depth: 0.25, height: 0.6 },
    color: 0xef4444,
    status: 'normal',
    info: {
      ip: '-',
      load: '-',
      temperature: '-',
      power: '-',
      description: '二氧化碳灭火器，有效期至 2027-03'
    }
  },
  {
    id: 'door',
    name: '门禁',
    type: 'door',
    position: { x: 3.2, z: -3 },
    size: { width: 1.0, depth: 0.15, height: 2.0 },
    color: 0x334155,
    status: 'normal',
    info: {
      ip: '10.0.1.254',
      load: '-',
      temperature: '-',
      power: '0.05kW',
      description: '机房门禁系统，刷卡+人脸双重认证',
      door: {
        bodyDetect: '无人员通过',
        bodyLastTime: '2026-07-31 09:12（吕博闻 刷卡进入）',
        waterDetect: '正常（无积水）',
        waterLevel: '0 mm'
      }
    }
  },
  {
    id: 'ac',
    name: '空调',
    type: 'ac',
    position: { x: -4.195, z: 0.0 },
    size: { width: 0.6, depth: 0.45, height: 1.5 },
    color: 0xe2e8f0,
    status: 'normal',
    info: {
      ip: '10.0.1.203',
      load: '88%',
      temperature: '18℃',
      power: '5.5kW',
      description: '精密空调 A01',
      ac: {
        mode: '制冷',
        coolingSetpoint: '22℃',
        fanSpeed: '高速',
        runStatus: '运行中',
        detail: {
          filterStatus: '正常',
          compHighPressure: '正常',
          compLowPressure: '正常',
          compDischargeTemp: '正常',
          fanProtection: '正常',
          fanOverload: '正常',
          unitPowerSetting: '开启',
          returnAirTemp: '24.5℃'
        }
      }
    }
  },
  {
    id: 'cam-01',
    name: '监控摄像头',
    type: 'camera',
    // 门禁右上方角落（右墙 x=4.5 / 后墙 z=-3 的交角附近），贴近天花板安装
    position: { x: 4.1, z: -2.75 },
    mountY: 2.65,
    size: { width: 0.18, depth: 0.32, height: 0.18 },
    color: 0x1f2937,
    status: 'normal',
    info: {
      brand: '海康威视',
      model: 'DS-2CD3T47',
      protocol: 'RTSP',
      port: 554,
      ip: 'http://10.0.140.35',
      username: 'admin',
      password: 'Admin@12345',
      // 实时监控页面地址：直接通过 iframe 嵌入摄像头 Web 管理/实时画面页（外部 IP 访问页面）。
      // 例如 http://192.168.1.64（按实际设备地址填写；若页面禁止被 iframe 嵌套，
      // 需在摄像头侧关闭 X-Frame-Options / 同源策略限制）。
      monitorUrl: 'http://10.0.140.35/doc/index.html',
      // 预留实时流地址：接入真实设备时填写，例如
      // rtsp://192.168.1.64:554/Streaming/Channels/101
      // 浏览器播放需经 media-server / ffmpeg 转为 WebRTC 或 HLS(m3u8)
      streamUrl: '',
      resolution: '2560×1440',
      fps: 25,
      description: '机房右后角落监控，覆盖门禁与操作台区域'
    }
  },
  {
    id: 'sensor-th01',
    name: '温湿度传感器',
    type: 'sensor',
    // 操作台所在后墙（z=-3）的高处，x 对齐操作台中心
    position: { x: 0.2, z: -2.92 },
    mountY: 2.3,
    size: { width: 0.14, depth: 0.06, height: 0.2 },
    color: 0xf1f5f9,
    status: 'normal',
    info: {
      ip: '10.0.1.205',
      description: '操作台墙面温湿度监测，数据上传至环控系统',
      sensor: {
        temperature: '23.5℃',
        humidity: '45%RH',
        range: '温度 0~50℃ / 湿度 10~99%RH'
      }
    }
  },
  {
    id: 'sensor-smoke01',
    name: '烟感传感器',
    type: 'smoke',
    // 紧邻温湿度传感器右侧，同一后墙（z=-3）高处，便于统一巡检
    position: { x: 0.95, z: -2.92 },
    mountY: 2.3,
    size: { width: 0.16, depth: 0.06, height: 0.16 },
    color: 0xf8fafc,
    status: 'normal',
    info: {
      ip: '10.0.1.206',
      description: '操作台墙面光电烟感探测，异常烟雾实时上报告警',
      smoke: {
        status: '正常（无烟雾）',
        sensitivity: '高灵敏度（0.5dB/m）',
        alarmThreshold: '≥ 0.15dB/m 触发告警',
        lastTest: '2026-07-10 例行测试通过'
      }
    }
  }
]
