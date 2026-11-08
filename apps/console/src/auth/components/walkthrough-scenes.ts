import * as THREE from 'three'

// Slow camera walkthroughs behind the sign-in panel: a data-hall aisle, an operations room and a
// boardroom. Built from simple shapes and canvas textures, so there are no video files to license or load.

const SCENE_SECONDS = 16 // time on each scene, including the fades
const FADE_SECONDS = 1.6

/** Tiny seeded random so every visit draws the same screens and racks. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** A dashboard-like screen: line chart, bars and rows of "text". */
function screenTexture(seed: number, accent = '#5fb4ff') {
  const r = rng(seed)
  return canvasTexture(256, 160, g => {
    g.fillStyle = '#0d1520'
    g.fillRect(0, 0, 256, 160)
    g.fillStyle = '#1b2838'
    g.fillRect(0, 0, 256, 14)
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#2f4258'
      g.fillRect(8 + i * 40, 4, 28, 6)
    }
    g.strokeStyle = accent
    g.lineWidth = 2
    g.beginPath()
    let y = 60 + r() * 20
    for (let x = 10; x <= 150; x += 10) {
      y = Math.min(90, Math.max(26, y + (r() - 0.5) * 22))
      if (x === 10) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
    for (let i = 0; i < 6; i++) {
      const bh = 10 + r() * 60
      g.fillStyle = i === 4 && r() > 0.5 ? '#e59a1a' : '#2f9e6b'
      g.fillRect(166 + i * 14, 96 - bh, 9, bh)
    }
    for (let row = 0; row < 4; row++) {
      g.fillStyle = '#26364a'
      g.fillRect(10, 108 + row * 12, 60 + r() * 120, 5)
    }
  })
}

function cityTexture(seed: number) {
  const r = rng(seed)
  return canvasTexture(256, 256, g => {
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#0b1222')
    grad.addColorStop(1, '#1b2135')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    for (let b = 0; b < 12; b++) {
      const x = b * 22 + r() * 6
      const top = 90 + r() * 110
      g.fillStyle = '#0a0d16'
      g.fillRect(x, top, 18, 256 - top)
      for (let wy = top + 6; wy < 250; wy += 8) {
        for (let wx = x + 3; wx < x + 16; wx += 5) {
          if (r() > 0.55) {
            g.fillStyle = r() > 0.8 ? '#ffd58a' : '#f3e2b8'
            g.fillRect(wx, wy, 2, 3)
          }
        }
      }
    }
  })
}

function floorTexture(tile: string, line: string, repeat: number) {
  const t = canvasTexture(128, 128, g => {
    g.fillStyle = tile
    g.fillRect(0, 0, 128, 128)
    g.strokeStyle = line
    g.lineWidth = 3
    g.strokeRect(0, 0, 128, 128)
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  return t
}

interface Shot {
  scene: THREE.Scene
  /** Places the camera for progress p (0 → 1) through this shot; `t` is seconds, for small sways. */
  pose: (cam: THREE.PerspectiveCamera, p: number, t: number) => void
  tick?: (t: number) => void
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

function addLights(scene: THREE.Scene, fog: string, hemi = 1.1) {
  scene.background = new THREE.Color(fog)
  scene.fog = new THREE.Fog(fog, 6, 26)
  scene.add(new THREE.HemisphereLight('#c9d6ff', '#1a1a1a', hemi))
}

/** A cold aisle between two rows of racks, with blinking status lights and ceiling light strips. */
function dataHall(): Shot {
  const scene = new THREE.Scene()
  addLights(scene, '#07090c', 0.9)
  const r = rng(7)
  const N = 22
  const SP = 0.64
  const z0 = -((N - 1) * SP) / 2

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 30), new THREE.MeshLambertMaterial({ map: floorTexture('#a9adb3', '#7d8288', 15) }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(8, 30), new THREE.MeshLambertMaterial({ color: '#1a1d22' }))
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = 3.2
  scene.add(ceil)

  const rackMat = new THREE.MeshLambertMaterial({ color: '#16181c' })
  // Perforated door: a dark mesh with vertical slats, like a real rack front.
  const doorTex = canvasTexture(64, 256, g => {
    g.fillStyle = '#23272d'
    g.fillRect(0, 0, 64, 256)
    g.fillStyle = '#3a4048'
    for (let x = 4; x < 64; x += 8) g.fillRect(x, 6, 3, 244)
    g.fillStyle = '#4b525c'
    g.fillRect(0, 0, 64, 4)
    g.fillRect(0, 252, 64, 4)
  })
  const doorMat = new THREE.MeshLambertMaterial({ map: doorTex })
  const racks = new THREE.InstancedMesh(box(0.6, 2.1, 1.05), rackMat, N * 2)
  const doors = new THREE.InstancedMesh(box(0.56, 2.0, 0.02), doorMat, N * 2)
  const m = new THREE.Matrix4()
  const LED_PER = 14
  const leds = new THREE.InstancedMesh(box(0.07, 0.03, 0.012), new THREE.MeshBasicMaterial({ toneMapped: false }), N * 2 * LED_PER)
  const ledColors = [new THREE.Color('#38e08c'), new THREE.Color('#4aa8ff'), new THREE.Color('#ffb43a')]
  const off = new THREE.Color('#10301f')
  let li = 0
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const k = (side < 0 ? 0 : N) + i
      const x = side * 1.15
      const z = z0 + i * SP
      racks.setMatrixAt(k, m.makeTranslation(x, 1.05, z))
      doors.setMatrixAt(k, m.makeTranslation(x - side * 0.535, 1.05, z))
      for (let l = 0; l < LED_PER; l++) {
        const y = 0.3 + l * 0.12 + r() * 0.03
        leds.setMatrixAt(li, m.makeTranslation(x - side * 0.55, y, z - 0.18 + (l % 3) * 0.06))
        leds.setColorAt(li, ledColors[r() < 0.82 ? 0 : r() < 0.7 ? 1 : 2])
        li++
      }
    }
  }
  scene.add(racks, doors, leds)

  const strip = new THREE.MeshBasicMaterial({ color: '#dfe8ff', toneMapped: false })
  for (const x of [-1.15, 0, 1.15]) {
    const s = new THREE.Mesh(box(0.08, 0.02, 28), strip)
    s.position.set(x, 3.15, 0)
    scene.add(s)
  }
  const tray = new THREE.MeshLambertMaterial({ color: '#3a3f47' })
  for (const x of [-1.15, 1.15]) {
    const t = new THREE.Mesh(box(0.5, 0.08, 28), tray)
    t.position.set(x, 2.55, 0)
    scene.add(t)
  }
  for (let z = -12; z <= 12; z += 4) {
    const p = new THREE.PointLight('#dfe8ff', 6, 7, 1.6)
    p.position.set(0, 3, z)
    scene.add(p)
  }

  // Blink a handful of LEDs a few times a second.
  const base = Array.from({ length: li }, (_, i) => {
    const c = new THREE.Color()
    leds.getColorAt(i, c)
    return c
  })
  let last = 0
  const tick = (t: number) => {
    if (t - last < 0.18) return
    last = t
    for (let n = 0; n < 40; n++) {
      const i = Math.floor(Math.random() * li)
      leds.setColorAt(i, Math.random() < 0.35 ? off : base[i])
    }
    leds.instanceColor!.needsUpdate = true
  }

  const pose = (cam: THREE.PerspectiveCamera, p: number, t: number) => {
    const z = 9 - p * 12
    cam.position.set(Math.sin(t * 0.35) * 0.08, 1.6 + Math.sin(t * 1.3) * 0.015, z)
    cam.lookAt(0.15 * Math.sin(t * 0.2), 1.45, z - 6)
  }
  return { scene, pose, tick }
}

/** An operations room: rows of desks with dashboards, facing a video wall. */
function opsRoom(): Shot {
  const scene = new THREE.Scene()
  addLights(scene, '#080a0e', 0.7)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ map: floorTexture('#2b2e33', '#25282c', 20) }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), new THREE.MeshLambertMaterial({ color: '#15171b' }))
  wall.position.set(0, 3, -7)
  scene.add(wall)
  let seed = 11
  for (let row = 0; row < 3; row++) {
    for (let col = -5; col <= 5; col++) {
      const tex = screenTexture(seed++, row === 1 && col === 0 ? '#ffb43a' : '#5fb4ff')
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.85), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
      panel.position.set(col * 1.4, 1.2 + row * 0.9, -6.95)
      scene.add(panel)
    }
  }

  const deskMat = new THREE.MeshLambertMaterial({ color: '#3a3d43' })
  const chairMat = new THREE.MeshLambertMaterial({ color: '#1d1f23' })
  const bezel = new THREE.MeshLambertMaterial({ color: '#0e0f11' })
  for (let row = 0; row < 3; row++) {
    const z = -3 + row * 2.4
    const desk = new THREE.Mesh(box(12, 0.06, 0.8), deskMat)
    desk.position.set(0, 0.74, z)
    scene.add(desk)
    for (let x = -5; x <= 5; x += 1.25) {
      for (let s = -1; s <= 1; s++) {
        const mon = new THREE.Group()
        const back = new THREE.Mesh(box(0.56, 0.34, 0.03), bezel)
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshBasicMaterial({ map: screenTexture(seed++), toneMapped: false }))
        screen.position.z = 0.017
        mon.add(back, screen)
        mon.position.set(x + s * 0.4, 1.0, z - 0.2)
        mon.rotation.y = -s * 0.28
        scene.add(mon)
      }
      const seat = new THREE.Mesh(box(0.5, 0.08, 0.5), chairMat)
      seat.position.set(x, 0.48, z + 0.75)
      const back = new THREE.Mesh(box(0.5, 0.6, 0.06), chairMat)
      back.position.set(x, 0.85, z + 1.0)
      scene.add(seat, back)
    }
    const glow = new THREE.PointLight('#5fb4ff', 3, 5, 1.8)
    glow.position.set(0, 1.4, z + 0.3)
    scene.add(glow)
  }
  const key = new THREE.PointLight('#ffffff', 10, 14, 1.5)
  key.position.set(0, 4, 3)
  scene.add(key)

  const pose = (cam: THREE.PerspectiveCamera, p: number, t: number) => {
    const x = -4 + p * 8
    cam.position.set(x, 2.0 + Math.sin(t * 1.1) * 0.012, 6.4)
    cam.lookAt(x * 0.55, 1.4, -6)
  }
  return { scene, pose }
}

/** A boardroom at night: long table, chairs, a wall screen and city windows. */
function boardroom(): Shot {
  const scene = new THREE.Scene()
  addLights(scene, '#0a0b0e', 0.8)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 24), new THREE.MeshLambertMaterial({ color: '#3a3430' }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  const wallMat = new THREE.MeshLambertMaterial({ color: '#25272b' })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), wallMat)
  back.position.set(0, 2, -6)
  const left = new THREE.Mesh(new THREE.PlaneGeometry(24, 4), wallMat)
  left.position.set(-3.5, 2, 0)
  left.rotation.y = Math.PI / 2
  scene.add(back, left)

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: screenTexture(41), toneMapped: false }))
  screen.position.set(0, 1.9, -5.97)
  scene.add(screen)
  const city = cityTexture(5)
  for (let i = 0; i < 5; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8), new THREE.MeshBasicMaterial({ map: city, toneMapped: false }))
    win.position.set(3.5, 1.7, -4.4 + i * 2.4)
    win.rotation.y = -Math.PI / 2
    scene.add(win)
    const mullion = new THREE.Mesh(box(0.06, 3, 0.08), new THREE.MeshLambertMaterial({ color: '#111' }))
    mullion.position.set(3.48, 1.7, -3.2 + i * 2.4)
    scene.add(mullion)
  }

  const table = new THREE.Mesh(box(1.8, 0.07, 8), new THREE.MeshLambertMaterial({ color: '#6b4e3a' }))
  table.position.set(0, 0.76, -0.5)
  scene.add(table)
  const chairMat = new THREE.MeshLambertMaterial({ color: '#141518' })
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      const z = -3.8 + i * 1.3
      const seat = new THREE.Mesh(box(0.55, 0.1, 0.55), chairMat)
      seat.position.set(side * 1.25, 0.5, z)
      const bk = new THREE.Mesh(box(0.08, 0.7, 0.55), chairMat)
      bk.position.set(side * 1.5, 0.9, z)
      scene.add(seat, bk)
    }
  }
  const pendant = new THREE.MeshBasicMaterial({ color: '#ffe3b0', toneMapped: false })
  for (let i = 0; i < 4; i++) {
    const z = -3.5 + i * 2
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), pendant)
    lamp.position.set(0, 2.5, z)
    const light = new THREE.PointLight('#ffd9a0', 5, 5, 1.6)
    light.position.set(0, 2.3, z)
    scene.add(lamp, light)
  }

  const pose = (cam: THREE.PerspectiveCamera, p: number, t: number) => {
    const z = 7.5 - p * 5
    cam.position.set(-0.9 + p * 0.5, 1.55 + Math.sin(t * 0.9) * 0.01, z)
    cam.lookAt(0.1, 1.45, -6)
  }
  return { scene, pose }
}

/** Drives the three shots in a loop and fades between them through black. */
export class Walkthrough {
  private renderer: THREE.WebGLRenderer
  private camera = new THREE.PerspectiveCamera(52, 1, 0.05, 60)
  private shots: Shot[]
  private ro: ResizeObserver
  private raf = 0
  private start = performance.now()
  private onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf)
    else if (!this.still) this.raf = requestAnimationFrame(this.frame)
  }

  private host: HTMLElement
  private fade: HTMLElement
  private still: boolean

  constructor(host: HTMLElement, fade: HTMLElement, still: boolean) {
    this.host = host
    this.fade = fade
    this.still = still
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
    host.prepend(this.renderer.domElement)
    this.shots = [dataHall(), opsRoom(), boardroom()]
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
    document.addEventListener('visibilitychange', this.onVisibility)
    if (still) {
      fade.style.opacity = '0'
      this.render(0, 0.45, 0) // reduced motion: one quiet frame of the data hall
    }
    else this.raf = requestAnimationFrame(this.frame)
  }

  private resize() {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.still) this.render(0, 0.45, 0)
  }

  private render(index: number, p: number, t: number) {
    const shot = this.shots[index]
    shot.pose(this.camera, p, t)
    shot.tick?.(t)
    this.renderer.render(shot.scene, this.camera)
  }

  private frame = (now: number) => {
    // rAF timestamps can be a little earlier than the performance.now() taken at start
    const t = Math.max(0, (now - this.start) / 1000)
    const index = Math.floor(t / SCENE_SECONDS) % this.shots.length
    const local = t % SCENE_SECONDS
    const edge = Math.min(local, SCENE_SECONDS - local)
    this.fade.style.opacity = String(Math.max(0, 1 - edge / FADE_SECONDS))
    this.render(index, local / SCENE_SECONDS, t)
    this.raf = requestAnimationFrame(this.frame)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    for (const { scene } of this.shots) {
      scene.traverse(o => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        for (const mat of ([] as THREE.Material[]).concat(mesh.material ?? [])) {
          ;(mat as THREE.MeshBasicMaterial).map?.dispose()
          mat.dispose()
        }
      })
    }
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
