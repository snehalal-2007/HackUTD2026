import * as THREE from 'three'
import type { Hall, Status } from './data'

// The 3D floor from docs/prototype.html, as an imperative class the React wrapper drives.
// Eight halls in two rows of four, a generator yard to the west and cooling to the east.

export interface ScenePalette {
  plinth: string; block: string; roof: string; rack: string; unit: string; edge: string; edgeOp: number
  ok: string; warn: string; crit: string; sky: string; gnd: string; amb: number; sun: number
}

// Lights use physical units (three r155+), so intensities are ~π times the prototype's r128 values.
export const LIGHT_PALETTE: ScenePalette = {
  plinth: '#dedbd4', block: '#ffffff', roof: '#f3f1ec', rack: '#222222', unit: '#e7e4dd', edge: '#222222', edgeOp: 0.18,
  ok: '#2f9e6b', warn: '#e59a1a', crit: '#e5484d', sky: '#ffffff', gnd: '#c8c3b8', amb: 2.3, sun: 2.3,
}
export const DARK_PALETTE: ScenePalette = {
  plinth: '#1f1f22', block: '#2c2c31', roof: '#34343a', rack: '#e4e4e7', unit: '#3b3b41', edge: '#e4e4e7', edgeOp: 0.22,
  ok: '#3fb67f', warn: '#e59a1a', crit: '#f2555a', sky: '#d9d9e3', gnd: '#101012', amb: 1.9, sun: 2.4,
}

const HH = 2.2 // hall height
const DIST = 36 // default camera distance
const HOME = { az: -0.62, el: 0.72 }
const POS: [number, number][] = Array.from({ length: 8 }, (_, i) => [-7.5 + 5 * (i % 4), i < 4 ? -3.6 : 3.6])

interface HallObj {
  hall: Hall
  g: THREE.Group
  shellMat: THREE.MeshLambertMaterial
  lid: THREE.Group
  lidMats: THREE.MeshLambertMaterial[]
  lidEdge: THREE.LineBasicMaterial
  beacon: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  mast: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>
  label: HTMLDivElement
}

export interface SceneOptions {
  onSelect: (id: string) => void
  /** Element whose bottom edge the building should stay below (the floor filter bar). */
  topInset?: () => number
}

export class FloorScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300)
  private world: THREE.Group | null = null
  private lights: THREE.Light[] = []
  private halls: HallObj[] = []
  private picks: THREE.Mesh[] = []
  private palette: ScenePalette = LIGHT_PALETTE
  private hallData: Hall[] = []
  private selected = ''
  private hovered: string | null = null
  private orbit = { az: HOME.az, el: HOME.el, dist: 40, distT: DIST, target: new THREE.Vector3(0, 1, 0) }
  private view = { x: 0, y: 0 }
  private frameReq = 0
  private homing = false
  private drag: { x: number; y: number; moved: number } | null = null
  private lastInteract = 0
  private size = { w: 0, h: 0 }
  private raf = 0
  private ro: ResizeObserver
  private ray = new THREE.Raycaster()
  private v = new THREE.Vector3()

  private host: HTMLElement
  private labels: HTMLElement
  private opts: SceneOptions

  constructor(host: HTMLElement, labels: HTMLElement, opts: SceneOptions) {
    this.host = host
    this.labels = labels
    this.opts = opts
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0x000000, 0)
    const cv = this.renderer.domElement
    cv.className = 'absolute inset-0 block size-full cursor-grab touch-none active:cursor-grabbing'
    host.prepend(cv)
    cv.addEventListener('pointerdown', this.onDown)
    cv.addEventListener('pointermove', this.onMove)
    cv.addEventListener('pointerup', this.onUp)
    cv.addEventListener('wheel', this.onWheel, { passive: false })
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
    this.raf = requestAnimationFrame(this.tick)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.clearWorld()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.replaceChildren()
  }

  /** Swap in a floor's halls. `drop` animates them falling into place (used on floor switches). */
  setHalls(halls: Hall[], drop = false) {
    this.hallData = halls
    this.build()
    if (drop) this.halls.forEach((H, i) => (H.g.position.y = 3 + i * 0.25)) // staggered drop
    this.frameReq = 3
  }

  setPalette(p: ScenePalette) {
    this.palette = p
    if (this.hallData.length) this.build()
  }

  setSelected(id: string) {
    this.selected = id
    this.halls.forEach(H => H.label.classList.toggle('is-on', H.hall.id === id))
    this.lastInteract = performance.now()
  }

  zoom(dir: 'in' | 'out') {
    this.homing = false
    this.orbit.distT = dir === 'in' ? Math.max(16, this.orbit.distT * 0.82) : Math.min(70, this.orbit.distT * 1.2)
    this.lastInteract = performance.now()
  }

  /** Glide rotation, tilt and zoom back to the start view. */
  goHome() {
    this.homing = true
  }

  // ── building the world ──

  private clearWorld() {
    if (this.world) {
      this.scene.remove(this.world)
      this.world.traverse(o => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        ;([] as THREE.Material[]).concat(m.material ?? []).forEach(x => x.dispose())
      })
    }
    this.lights.forEach(l => this.scene.remove(l))
    this.world = null
    this.halls = []
    this.picks = []
    this.labels.replaceChildren()
  }

  private build() {
    this.clearWorld()
    const t = this.palette
    const world = new THREE.Group()
    this.world = world
    this.scene.add(world)
    const hemi = new THREE.HemisphereLight(t.sky, t.gnd, t.amb)
    const sun = new THREE.DirectionalLight('#ffffff', t.sun)
    sun.position.set(-14, 26, 12)
    sun.castShadow = true
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 })
    sun.shadow.camera.updateProjectionMatrix()
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0008
    sun.shadow.radius = 4
    this.scene.add(hemi, sun)
    this.lights = [hemi, sun]

    const edgeMat = new THREE.LineBasicMaterial({ color: t.edge, transparent: true, opacity: t.edgeOp })
    const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c })
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, edges: THREE.LineBasicMaterial | null = edgeMat) => {
      const g = new THREE.BoxGeometry(w, h, d)
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(x, y, z)
      mesh.castShadow = mesh.receiveShadow = true
      parent.add(mesh)
      if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), edges))
      return mesh
    }
    const cyl = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    box(38, 0.5, 18, mat(t.plinth), 0, -0.25, 0, world) // plinth
    box(19.8, 1.1, 1.5, mat(t.roof), 0, 0.55, 0, world) // spine corridor
    const unitM = mat(t.unit)
    for (let k = 0; k < 4; k++) { // generator yard
      const z = -5.1 + k * 3.4
      box(1.3, 1, 2.4, unitM, -14.6, 0.5, z, world)
      cyl(0.14, 1.2, unitM, -14.2, 1.5, z - 0.7, world)
    }
    for (const z of [-3.4, 3.4]) { // cooling towers
      cyl(1.2, 1.8, unitM, 14.4, 0.9, z, world)
      cyl(0.9, 0.15, mat(t.rack), 14.4, 1.85, z, world)
    }
    box(2.2, 1.3, 2.6, unitM, 14.4, 0.65, 0, world) // substation

    this.hallData.forEach((hall, i) => {
      const [x, z] = POS[i]
      const g = new THREE.Group()
      g.position.set(x, 0, z)
      world.add(g)
      const shellMat = new THREE.MeshLambertMaterial({ color: t.block, transparent: true, opacity: 1 })
      const shell = box(4.3, HH, 5, shellMat, 0, HH / 2, 0, g) // the walls keep their ground shadow the whole time
      shell.userData.id = hall.id
      this.picks.push(shell)
      const rackM = mat(t.rack)
      for (let r = 0; r < 6; r++) {
        const rk = box(0.34, 1.3, 3.7, rackM, -1.55 + r * 0.62, 0.66, 0, g, null)
        rk.castShadow = rk.receiveShadow = false // racks never sit in the walls' shadow, so nothing pops as a hall opens
      }
      const band = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.14, 5.12), new THREE.MeshBasicMaterial({ color: t[hall.status] }))
      band.position.y = 0.14
      g.add(band)
      // lid: roof + rooftop units, lifts away when the hall is selected
      const lid = new THREE.Group()
      g.add(lid)
      const lidMat = new THREE.MeshLambertMaterial({ color: t.roof, transparent: true, opacity: 1 })
      const lidUnit = new THREE.MeshLambertMaterial({ color: t.unit, transparent: true, opacity: 1 })
      const lidEdge = new THREE.LineBasicMaterial({ color: t.edge, transparent: true, opacity: t.edgeOp })
      box(4.55, 0.16, 5.25, lidMat, 0, HH + 0.08, 0, lid, lidEdge)
      for (let k = 0; k < 3; k++) {
        box(0.95, 0.42, 0.95, lidUnit, -1.3 + 1.3 * k, HH + 0.37, -1.3, lid, lidEdge)
        const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 18), lidMat)
        fan.position.set(-1.3 + 1.3 * k, HH + 0.6, -1.3)
        lid.add(fan)
      }
      box(2.4, 0.3, 0.7, lidUnit, -0.6, HH + 0.3, 1.6, lid, lidEdge)
      lid.traverse(o => (o.castShadow = false)) // the roof never casts a shadow, so nothing pops while it fades
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: t[hall.status], transparent: true }))
      beacon.position.set(1.75, HH + 0.55, 1.95)
      g.add(beacon)
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), new THREE.MeshBasicMaterial({ color: t.edge, transparent: true }))
      mast.position.set(1.75, HH + 0.3, 1.95)
      g.add(mast)

      const label = document.createElement('div')
      label.className = `floor-label s-${hall.status}${hall.id === this.selected ? ' is-on' : ''}`
      label.innerHTML = `<i></i>${hall.id}`
      label.addEventListener('click', () => this.opts.onSelect(hall.id))
      this.labels.append(label)
      this.halls.push({ hall, g, shellMat, lid, lidMats: [lidMat, lidUnit], lidEdge, beacon, mast, label })
    })
  }

  // ── camera, framing, animation ──

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    if (w !== this.size.w || h !== this.size.h) this.frameReq = 3 // re-centre only when the tile changes size
    this.size = { w, h }
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.setViewOffset(w, h, this.view.x, this.view.y, w, h)
    this.camera.updateProjectionMatrix()
  }

  /** Centre the halls (and their labels) in the free area below the floor bar. ease 1 = one exact correction. */
  private frame(ease = 1) {
    const { w, h } = this.size
    if (!w || !this.halls.length) return
    this.camera.updateMatrixWorld()
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
    const pts: [number, number, number, number][] = []
    for (const x of [-9.7, 9.7]) for (const z of [-6.2, 6.2]) for (const y of [0, HH + 0.6]) pts.push([x, y, z, 0])
    this.halls.forEach(H => pts.push([H.g.position.x, HH + (H.hall.id === this.selected ? 2.9 : 1.3), H.g.position.z, 36])) // labels stand ~36px above their anchor
    for (const [x, y, z, lift] of pts) {
      this.v.set(x, y, z).project(this.camera)
      if (!isFinite(this.v.x) || !isFinite(this.v.y) || this.v.z > 1) return
      const px = ((this.v.x + 1) / 2) * w, py = ((1 - this.v.y) / 2) * h
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py - lift); y1 = Math.max(y1, py)
    }
    const top = (this.opts.topInset?.() ?? 0) + 12, bottom = h - 12
    const dx = (x0 + x1) / 2 - w / 2, dy = (y0 + y1) / 2 - (top + bottom) / 2
    this.view.x = Math.max(-w / 2, Math.min(w / 2, this.view.x + dx * ease))
    this.view.y = Math.max(-h / 2, Math.min(h / 2, this.view.y + dy * ease))
    this.camera.setViewOffset(w, h, this.view.x, this.view.y, w, h)
    this.camera.updateProjectionMatrix()
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    const o = this.orbit
    if (this.homing) {
      const da = Math.atan2(Math.sin(HOME.az - o.az), Math.cos(HOME.az - o.az)) // shortest way round
      o.az += da * 0.09
      o.el += (HOME.el - o.el) * 0.09
      o.distT = DIST
      if (Math.abs(da) < 0.002 && Math.abs(HOME.el - o.el) < 0.002 && Math.abs(o.dist - DIST) < 0.02) { this.homing = false; this.frameReq = 2 }
      this.lastInteract = now // no idle spin while gliding home
    } else if (now - this.lastInteract > 4000 && !this.drag) o.az += 0.0006 // slow idle turn
    o.dist += (o.distT - o.dist) * (this.homing ? 0.09 : 0.12)
    this.camera.position.set(o.target.x + o.dist * Math.cos(o.el) * Math.sin(o.az), o.target.y + o.dist * Math.sin(o.el), o.target.z + o.dist * Math.cos(o.el) * Math.cos(o.az))
    this.camera.lookAt(o.target)
    if (this.homing) this.frame(0.15)
    else if (this.frameReq) { this.frameReq--; this.frame() }

    const f = 0.2, t = now / 1000
    this.halls.forEach(H => {
      const on = H.hall.id === this.selected
      H.g.position.y += ((on ? 0.3 : 0) - H.g.position.y) * 0.12
      H.lid.position.y += ((on ? 1.4 : 0) - H.lid.position.y) * f
      H.lidMats.forEach(m => { m.opacity += ((on ? 0 : 1) - m.opacity) * f; m.depthWrite = !on && m.opacity > 0.97 }) // see-through parts never write depth: no flicker
      H.lidEdge.opacity += ((on ? 0 : this.palette.edgeOp) - H.lidEdge.opacity) * f
      H.lid.visible = H.lidMats[0].opacity > 0.01 || H.lidEdge.opacity > 0.01
      const so = on ? 0.13 : this.hovered === H.hall.id ? 0.92 : 1
      H.shellMat.opacity += (so - H.shellMat.opacity) * f
      H.shellMat.depthWrite = !on && H.shellMat.opacity > 0.97
      H.beacon.material.opacity += ((on ? 0 : 1) - H.beacon.material.opacity) * f // the status pin fades with the roof
      H.mast.material.opacity = H.beacon.material.opacity
      H.beacon.visible = H.mast.visible = H.beacon.material.opacity > 0.01
      const pulse: Record<Status, number> = { crit: 1 + 0.35 * Math.sin(t * 5), warn: 1 + 0.15 * Math.sin(t * 2.5), ok: 1 }
      H.beacon.scale.setScalar(pulse[H.hall.status])
    })
    this.renderer.render(this.scene, this.camera)

    const { w, h } = this.size
    this.halls.forEach(H => {
      this.v.set(H.g.position.x, H.g.position.y + HH + (H.hall.id === this.selected ? 2.9 : 1.3), H.g.position.z).project(this.camera)
      if (this.v.z > 1) { H.label.style.display = 'none'; return }
      H.label.style.display = ''
      H.label.style.transform = `translate(${(((this.v.x + 1) / 2) * w).toFixed(1)}px,${(((1 - this.v.y) / 2) * h).toFixed(1)}px) translate(-50%,-100%)`
      H.label.style.zIndex = String(Math.round((1 - this.v.z) * 1e4))
    })
  }

  // ── pointer orbit + picking ──

  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1), this.camera)
    const hit = this.ray.intersectObjects(this.picks, false)[0]
    return hit ? (hit.object.userData.id as string) : null
  }
  private onDown = (e: PointerEvent) => {
    this.homing = false
    this.drag = { x: e.clientX, y: e.clientY, moved: 0 }
    this.renderer.domElement.setPointerCapture(e.pointerId)
    this.lastInteract = performance.now()
  }
  private onMove = (e: PointerEvent) => {
    if (this.drag) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y
      this.drag = { x: e.clientX, y: e.clientY, moved: this.drag.moved + Math.abs(dx) + Math.abs(dy) }
      this.orbit.az -= dx * 0.006
      this.orbit.el = Math.max(0.3, Math.min(1.45, this.orbit.el + dy * 0.005)) // flatter angles stack the back labels on the front ones
      this.lastInteract = performance.now()
      return
    }
    const id = this.pick(e)
    if (id !== this.hovered) {
      this.hovered = id
      this.renderer.domElement.style.cursor = id ? 'pointer' : ''
      this.halls.forEach(H => H.label.classList.toggle('is-hover', H.hall.id === id))
    }
  }
  private onUp = (e: PointerEvent) => {
    if (this.drag && this.drag.moved < 6) {
      const id = this.pick(e)
      if (id) this.opts.onSelect(id)
    }
    this.drag = null
  }
  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.homing = false
    this.orbit.distT = Math.max(16, Math.min(70, this.orbit.distT * (1 + e.deltaY * 0.0012)))
    this.lastInteract = performance.now()
  }
}
