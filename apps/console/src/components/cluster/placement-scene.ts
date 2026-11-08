import * as THREE from 'three'
import { SITES } from '@/components/floor/data'
import { DARK_PALETTE, LIGHT_PALETTE, type ScenePalette } from '@/components/floor/scene'
import { RACK_SLOTS, type RackVM } from './use-cluster'

// 3D placement map for the Cluster view: the 16 real racks grouped by data center and region, with the simulated
// instances sitting in their slots. When an instance's rack changes in the `instance` table (a live migration) it
// flies from the old slot to the new one: one object the whole way, so there is never a second copy, and the old slot
// shows an empty outline until it lands. Nothing flies on first load, only on a genuine change.

const FLIGHT_MS = 1700
const RING_MS = 800
const GHOST_MS = 1200
const RACK_W = 1.3
const RACK_H = 2.3
const RACK_D = 1.4
const SLOT_H = 0.3
const SLOT_PITCH = 0.4
const SLOT_Y0 = 0.3

const INSTANCE = { running: '#3b82f6', throttled: '#e59a1a', patching: '#8b5cf6' } as const
const STALE = '#8a8a93'

export interface PlacementOptions {
  onPickInstance: (id: string | null) => void
  onPickRack: (id: string) => void
  /** Called when an instance is seen moving between racks (never on first load). */
  onMigration?: (m: { instanceId: string; service: string; from: string; to: string }) => void
}

interface RackObj {
  id: string
  pos: THREE.Vector3
  frame: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  band: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  outline: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> // target highlight
  tint: THREE.Color
  slots: (string | null)[]
  label: HTMLDivElement
  text: HTMLSpanElement
  dot: HTMLElement
  target: boolean
}

interface InstObj {
  id: string
  service: string
  state: string
  rackId: string
  slot: number
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>
  tint: THREE.Color
  flying: boolean
}

interface Flight {
  inst: InstObj
  t0: number
  a: THREE.Vector3
  b: THREE.Vector3
  c: THREE.Vector3
  trail: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>
  segs: number
  ghost: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  tag: HTMLDivElement
  landed: number | null
}

const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
// cubic-bezier(0.23, 1, 0.32, 1): the console's ease-out-strong, used for arrivals and fades.
const easeOutStrong = (u: number) => {
  const x1 = 0.23, y1 = 1, x2 = 0.32, y2 = 1
  const bez = (a: number, b: number, t: number) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t
  let t = u
  for (let i = 0; i < 6; i++) {
    const x = bez(x1, x2, t) - u
    const d = 3 * x1 * (1 - t) * (1 - t) + 6 * (x2 - x1) * (1 - t) * t + 3 * (1 - x2) * t * t
    if (Math.abs(d) < 1e-6) break
    t -= x / d
  }
  return bez(y1, y2, Math.min(1, Math.max(0, t)))
}

/** Region rows (one per site) of data-center pads; unknown data centers go in a last row. */
function layout(racks: RackVM[]) {
  const dcs = [...new Set(racks.map(r => r.datacenterId))]
  const rows: { name: string; dcs: string[] }[] = SITES.map(s => ({ name: s.name, dcs: s.floors.flat().filter(d => dcs.includes(d)) })).filter(r => r.dcs.length)
  const known = new Set(rows.flatMap(r => r.dcs))
  const rest = dcs.filter(d => !known.has(d))
  if (rest.length) rows.push({ name: 'Other', dcs: rest })
  return rows
}

export class PlacementScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300)
  private world: THREE.Group | null = null
  private lights: THREE.Light[] = []
  private racks = new Map<string, RackObj>()
  private insts = new Map<string, InstObj>()
  private flights: Flight[] = []
  private picks: THREE.Object3D[] = []
  private palette: ScenePalette = LIGHT_PALETTE
  private latest: RackVM[] = []
  private loaded = false
  private signature = ''
  private selected: string | null = null
  private targetIds = new Set<string>()
  private hover: string | null = null
  private orbit = { az: -0.3, el: 0.95, dist: 46, distT: 46, target: new THREE.Vector3(1.4, 0.6, 0.4) }
  private drag: { x: number; y: number; moved: number } | null = null
  private size = { w: 0, h: 0 }
  private raf = 0
  private ro: ResizeObserver
  private ray = new THREE.Raycaster()
  private v = new THREE.Vector3()
  private host: HTMLElement
  private labels: HTMLElement
  private opts: PlacementOptions
  private hoverTip: HTMLDivElement
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  private reduceMotion = this.motionQuery.matches
  private onMotionPref = () => { this.reduceMotion = this.motionQuery.matches }

  constructor(host: HTMLElement, labels: HTMLElement, opts: PlacementOptions) {
    this.motionQuery.addEventListener('change', this.onMotionPref)
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
    this.hoverTip = document.createElement('div')
    this.hoverTip.className = 'pointer-events-none absolute top-0 left-0 z-10 hidden rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-sm'
    labels.append(this.hoverTip)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
    this.raf = requestAnimationFrame(this.tick)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.motionQuery.removeEventListener('change', this.onMotionPref)
    this.ro.disconnect()
    this.clearWorld()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.replaceChildren()
  }

  setPalette(p: ScenePalette) {
    this.palette = p
    if (this.latest.length) this.build(this.latest)
  }

  /** The selected instance (or null) and the racks it may move to. Highlights both. */
  setSelection(instanceId: string | null, targets: Set<string>) {
    this.selected = instanceId
    this.targetIds = targets
    for (const r of this.racks.values()) {
      r.target = targets.has(r.id)
      r.outline.visible = r.target
    }
    for (const i of this.insts.values()) this.paint(i, true)
  }

  zoom(dir: 'in' | 'out') {
    this.orbit.distT = dir === 'in' ? Math.max(14, this.orbit.distT * 0.82) : Math.min(70, this.orbit.distT * 1.2)
  }

  // ── data ──

  /** Feed the latest racks (with their instances). The first call places everything; later calls animate real moves. */
  setRacks(racks: RackVM[]) {
    this.latest = racks
    const sig = racks.map(r => r.id).join('|')
    if (sig !== this.signature) {
      this.signature = sig
      this.build(racks)
      return
    }
    this.sync(racks)
  }

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
    this.racks.clear()
    this.insts.clear()
    this.flights.forEach(f => f.tag.remove())
    this.flights = []
    this.fixed = []
    this.picks = []
    this.loaded = false
    this.labels.replaceChildren(this.hoverTip)
  }

  private build(racks: RackVM[]) {
    this.clearWorld()
    const t = this.palette
    const world = new THREE.Group()
    this.world = world
    this.scene.add(world)
    const hemi = new THREE.HemisphereLight(t.sky, t.gnd, t.amb)
    const sun = new THREE.DirectionalLight('#ffffff', t.sun)
    sun.position.set(-12, 24, 14)
    sun.castShadow = true
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 })
    sun.shadow.camera.updateProjectionMatrix()
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0008
    this.scene.add(hemi, sun)
    this.lights = [hemi, sun]

    const edgeMat = new THREE.LineBasicMaterial({ color: t.edge, transparent: true, opacity: t.edgeOp })
    const rows = layout(racks)
    const padW = 5.2, padD = 3.4, pitchX = 6.0, pitchZ = 5.6
    const zOf = (r: number) => (r - (rows.length - 1) / 2) * pitchZ
    const cols = Math.max(1, ...rows.map(r => r.dcs.length))
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(cols * pitchX + 1, 0.4, rows.length * pitchZ + 0.6), new THREE.MeshLambertMaterial({ color: t.plinth }))
    plinth.position.y = -0.2
    plinth.receiveShadow = true
    world.add(plinth)

    rows.forEach((row, ri) => {
      this.addLabel(new THREE.Vector3(-(cols * pitchX) / 2 - 0.2, 0.2, zOf(ri)), row.name, 'region')
      row.dcs.forEach((dc, ci) => {
        const x = (ci - (cols - 1) / 2) * pitchX, z = zOf(ri)
        const pad = new THREE.Mesh(new THREE.BoxGeometry(padW, 0.14, padD), new THREE.MeshLambertMaterial({ color: t.block }))
        pad.position.set(x, 0.07, z)
        pad.receiveShadow = true
        pad.add(new THREE.LineSegments(new THREE.EdgesGeometry(pad.geometry), edgeMat))
        world.add(pad)
        const name = racks.find(r => r.datacenterId === dc)?.datacenter ?? dc
        this.addLabel(new THREE.Vector3(x, 0.14, z + padD / 2 + 0.2), name, 'dc')
        const mine = racks.filter(r => r.datacenterId === dc).sort((a, b) => a.cab.localeCompare(b.cab))
        mine.forEach((r, k) => {
          const rx = x + (k - (mine.length - 1) / 2) * 2.5
          this.addRack(world, r, new THREE.Vector3(rx, 0.14, z), edgeMat)
        })
      })
    })

    this.sync(racks)
    this.loaded = true
    this.setSelection(this.selected, this.targetIds)
  }

  private addLabel(at: THREE.Vector3, text: string, kind: 'region' | 'dc') {
    const el = document.createElement('div')
    el.className =
      kind === 'region'
        ? 'absolute left-0 top-0 whitespace-nowrap text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'
        : 'absolute left-0 top-0 whitespace-nowrap text-[11px] text-muted-foreground'
    el.textContent = text
    this.labels.append(el)
    this.fixed.push({ el, at, kind })
  }
  private fixed: { el: HTMLElement; at: THREE.Vector3; kind: 'region' | 'dc' }[] = []

  private addRack(world: THREE.Group, r: RackVM, pos: THREE.Vector3, edgeMat: THREE.LineBasicMaterial) {
    const t = this.palette
    const frame = new THREE.Mesh(new THREE.BoxGeometry(RACK_W, RACK_H, RACK_D), new THREE.MeshBasicMaterial({ color: t.rack, transparent: true, opacity: 0.08, depthWrite: false }))
    frame.position.set(pos.x, pos.y + RACK_H / 2, pos.z)
    frame.userData = { rack: r.id }
    frame.add(new THREE.LineSegments(new THREE.EdgesGeometry(frame.geometry), edgeMat))
    world.add(frame)
    this.picks.push(frame)
    const band = new THREE.Mesh(new THREE.BoxGeometry(RACK_W + 0.12, 0.1, RACK_D + 0.12), new THREE.MeshBasicMaterial({ color: t.ok }))
    band.position.set(pos.x, pos.y + 0.05, pos.z)
    world.add(band)
    const outline = new THREE.Mesh(new THREE.BoxGeometry(RACK_W + 0.3, RACK_H + 0.3, RACK_D + 0.3), new THREE.MeshBasicMaterial({ color: t.ok, transparent: true, opacity: 0.16, depthWrite: false }))
    outline.position.copy(frame.position)
    outline.add(new THREE.LineSegments(new THREE.EdgesGeometry(outline.geometry), new THREE.LineBasicMaterial({ color: t.ok })))
    outline.visible = false
    world.add(outline)

    const label = document.createElement('div')
    label.className = 'absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap rounded-full border bg-card/90 px-1.5 py-px text-[10px] text-foreground'
    const dot = document.createElement('i')
    dot.className = 'inline-block size-2 rounded-full'
    const text = document.createElement('span')
    label.append(dot, text)
    this.labels.append(label)
    const rack: RackObj = { id: r.id, pos, frame, band, outline, tint: new THREE.Color(t.ok), slots: Array(RACK_SLOTS).fill(null), label, text, dot, target: false }
    this.racks.set(r.id, rack)
  }

  private slotPos(rack: RackObj, slot: number) {
    return new THREE.Vector3(rack.pos.x, rack.pos.y + SLOT_Y0 + slot * SLOT_PITCH, rack.pos.z)
  }

  private rackColor(status: RackVM['status']) {
    const t = this.palette
    return status === 'ready' ? t.ok : status === 'warm' ? t.warn : status === 'incident' ? t.crit : STALE
  }

  /** Reconcile instances with the data: place new ones, recolor, and fly the ones whose rack changed. */
  private sync(racks: RackVM[]) {
    const seen = new Set<string>()
    for (const r of racks) {
      const rack = this.racks.get(r.id)
      if (!rack) continue
      rack.tint.set(this.rackColor(r.status))
      if (!this.loaded || this.reduceMotion) rack.band.material.color.copy(rack.tint)
      const word = { ready: 'Ready', warm: 'Warm', incident: 'Incident', stale: 'Silent' }[r.status]
      rack.text.textContent = `${r.cab} ${word}`
      rack.label.title = `${r.cab}: ${word}, hottest GPU ${r.gpuMaxC.toFixed(1)} °C (recorded telemetry)`
      rack.dot.style.background = this.rackColor(r.status)
      for (const i of r.instances) {
        seen.add(i.id)
        const cur = this.insts.get(i.id)
        if (!cur) {
          this.place(rack, i)
        } else if (cur.rackId !== r.id) {
          this.move(cur, rack)
        } else {
          cur.state = i.state
          this.paint(cur)
        }
      }
    }
    for (const [id, i] of [...this.insts]) {
      if (!seen.has(id)) {
        this.free(i)
        this.world?.remove(i.mesh)
        i.mesh.geometry.dispose()
        i.mesh.material.dispose()
        this.insts.delete(id)
        this.picks = this.picks.filter(p => p !== i.mesh)
      }
    }
  }

  private free(i: InstObj) {
    const rack = this.racks.get(i.rackId)
    if (rack && rack.slots[i.slot] === i.id) rack.slots[i.slot] = null
  }

  private takeSlot(rack: RackObj, id: string) {
    let s = rack.slots.indexOf(null)
    if (s < 0) s = rack.slots.length - 1 // never expected: a rack holds RACK_SLOTS instances
    rack.slots[s] = id
    return s
  }

  private place(rack: RackObj, i: { id: string; service: string; state: string }) {
    const slot = this.takeSlot(rack, i.id)
    const mat = new THREE.MeshLambertMaterial({ color: INSTANCE.running })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(RACK_W - 0.3, SLOT_H, RACK_D - 0.3), mat)
    mesh.position.copy(this.slotPos(rack, slot))
    mesh.castShadow = true
    mesh.userData = { instance: i.id }
    this.world?.add(mesh)
    this.picks.push(mesh)
    const obj: InstObj = { id: i.id, service: i.service, state: i.state, rackId: rack.id, slot, mesh, tint: new THREE.Color(INSTANCE.running), flying: false }
    this.insts.set(i.id, obj)
    this.paint(obj, true)
  }

  private paint(i: InstObj, instant = false) {
    const base = i.state === 'throttled' ? this.palette.warn : i.state === 'patching' ? INSTANCE.patching : INSTANCE.running
    i.tint.set(base)
    const on = this.selected === i.id
    i.mesh.material.emissive.set(on ? '#ffffff' : '#000000')
    i.mesh.material.emissiveIntensity = on ? 0.45 : 0
    if (instant || this.reduceMotion) i.mesh.material.color.copy(i.tint)
  }

  /** The instance's rack changed in the data: fly it (one object, never a copy) from the old slot to the new one. */
  private move(i: InstObj, to: RackObj) {
    const from = this.racks.get(i.rackId)
    const earlier = this.flights.find(f => f.inst === i)
    if (earlier) this.endFlight(earlier) // moved again mid-flight: drop the old arc and leave from where it is
    const a = earlier ? i.mesh.position.clone() : from ? this.slotPos(from, i.slot) : i.mesh.position.clone()
    this.free(i)
    const slot = this.takeSlot(to, i.id)
    const b = this.slotPos(to, slot)
    i.rackId = to.id
    i.slot = slot
    this.opts.onMigration?.({ instanceId: i.id, service: i.service, from: from?.id ?? '', to: to.id })
    const t = this.palette
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(RACK_W - 0.3, SLOT_H, RACK_D - 0.3), new THREE.MeshBasicMaterial({ color: t.edge, transparent: true, opacity: 0, wireframe: true }))
    ghost.position.copy(a)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 40), new THREE.MeshBasicMaterial({ color: t.ok, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(b.x, to.pos.y + 0.03, b.z)
    const dist = a.distanceTo(b)
    const c = a.clone().lerp(b, 0.5)
    c.y = Math.max(a.y, b.y) + 1.6 + dist * 0.38
    const SEGS = 48
    const trail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, c, b), SEGS, 0.045, 6, false), new THREE.MeshBasicMaterial({ color: INSTANCE.running, transparent: true, opacity: 0, depthWrite: false }))
    trail.geometry.setDrawRange(0, 0)
    this.world?.add(ghost, ring, trail)
    const tag = document.createElement('div')
    tag.className = 'absolute left-0 top-0 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background'
    tag.textContent = `${i.service} · moving`
    this.labels.append(tag)
    i.flying = true
    this.flights.push({ inst: i, t0: performance.now(), a, b, c, trail, segs: SEGS, ghost, ring, tag, landed: null })
  }

  private endFlight(fl: Flight) {
    for (const m of [fl.trail, fl.ghost, fl.ring]) {
      this.world?.remove(m)
      m.geometry.dispose()
      m.material.dispose()
    }
    fl.tag.remove()
    fl.inst.flying = false
    this.flights = this.flights.filter(f => f !== fl)
  }

  // ── camera + frame loop ──

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    this.size = { w, h }
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private project(p: THREE.Vector3, el: HTMLElement, dx = 0, dy = 0, anchor = 'translate(-50%,-100%)') {
    this.v.copy(p).project(this.camera)
    if (this.v.z > 1) { el.style.display = 'none'; return false }
    el.style.display = ''
    const { w, h } = this.size
    el.style.transform = `translate(${(((this.v.x + 1) / 2) * w + dx).toFixed(1)}px,${(((1 - this.v.y) / 2) * h + dy).toFixed(1)}px) ${anchor}`
    return true
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    const o = this.orbit
    o.dist += (o.distT - o.dist) * 0.12
    this.camera.position.set(o.target.x + o.dist * Math.cos(o.el) * Math.sin(o.az), o.target.y + o.dist * Math.sin(o.el), o.target.z + o.dist * Math.cos(o.el) * Math.cos(o.az))
    this.camera.lookAt(o.target)
    this.camera.updateMatrixWorld()

    const f = 0.2
    for (const r of this.racks.values()) {
      r.band.material.color.lerp(r.tint, f)
      r.outline.material.color.set(this.palette.ok)
      if (r.outline.visible && !this.reduceMotion) r.outline.material.opacity = 0.12 + 0.06 * Math.sin(now / 280)
    }
    for (const i of this.insts.values()) if (!i.flying) i.mesh.material.color.lerp(i.tint, f)

    this.flights = this.flights.filter(fl => {
      const i = fl.inst
      const dur = this.reduceMotion ? 0 : FLIGHT_MS
      const u = dur === 0 ? 1 : Math.min(1, (now - fl.t0) / dur)
      const e = easeInOut(u)
      if (u < 1) {
        // quadratic Bezier through the control point, so it arcs up and over
        const p = fl.a.clone().multiplyScalar((1 - e) * (1 - e)).add(fl.c.clone().multiplyScalar(2 * (1 - e) * e)).add(fl.b.clone().multiplyScalar(e * e))
        i.mesh.position.copy(p)
        i.mesh.material.color.lerp(new THREE.Color('#ffffff'), 0.1)
        fl.trail.geometry.setDrawRange(0, Math.max(6, Math.floor(e * fl.segs)) * 36)
        fl.trail.material.opacity = 0.9
        fl.ghost.material.opacity = 0.7 // the vacated slot: an empty outline, not a second copy
        this.project(p, fl.tag, 0, -14)
        return true
      }
      if (fl.landed === null) {
        fl.landed = now
        i.flying = false
        i.mesh.position.copy(fl.b)
        fl.tag.textContent = `${i.service} · landed`
        this.project(fl.b, fl.tag, 0, -22)
        i.mesh.material.color.lerp(i.tint, 0.5)
      }
      const k = (now - fl.landed) / (this.reduceMotion ? 400 : GHOST_MS)
      const ringK = Math.min(1, (now - fl.landed) / (this.reduceMotion ? 400 : RING_MS))
      fl.trail.material.opacity = 0.9 * (1 - easeOutStrong(Math.min(1, k)))
      fl.ghost.material.opacity = 0.7 * (1 - easeOutStrong(Math.min(1, k)))
      fl.ring.material.opacity = 0.9 * (1 - ringK)
      fl.ring.scale.setScalar(this.reduceMotion ? 1 : 0.6 + 1.4 * easeOutStrong(ringK))
      this.project(i.mesh.position, fl.tag, 0, -22)
      fl.tag.style.opacity = String(Math.max(0, 1 - Math.max(0, k - 0.5) * 2))
      if (k < 1) return true
      this.endFlight(fl)
      return false
    })

    this.renderer.render(this.scene, this.camera)

    let n = 0
    for (const r of this.racks.values()) this.project(new THREE.Vector3(r.pos.x, r.pos.y + RACK_H + 0.1, r.pos.z), r.label, 0, n++ % 2 ? -12 : 0)
    for (const l of this.fixed) this.project(l.at, l.el, 0, 0, l.kind === 'region' ? 'translate(-100%,-50%)' : 'translate(-50%,0)')
    const hov = this.hover ? this.insts.get(this.hover) : undefined
    if (hov && !hov.flying) {
      this.hoverTip.textContent = `${hov.service} · ${hov.id} · ${hov.state}`
      this.hoverTip.style.display = 'block'
      this.project(hov.mesh.position, this.hoverTip, 0, -12)
    } else this.hoverTip.style.display = 'none'
  }

  // ── pointer: orbit, hover, pick ──

  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1), this.camera)
    // An instance counts as a hit on its own rack too, so a Ready target rack can be clicked anywhere on it.
    const hit = this.ray.intersectObjects(this.picks, false)
    const inst = hit.find(h => h.object.userData.instance)
    const frame = hit.find(h => h.object.userData.rack)
    const instance = inst ? (inst.object.userData.instance as string) : undefined
    const rack = frame ? (frame.object.userData.rack as string) : instance ? this.insts.get(instance)?.rackId : undefined
    return { instance, rack }
  }
  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, moved: 0 }
    this.renderer.domElement.setPointerCapture(e.pointerId)
  }
  private onMove = (e: PointerEvent) => {
    if (this.drag) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y
      this.drag = { x: e.clientX, y: e.clientY, moved: this.drag.moved + Math.abs(dx) + Math.abs(dy) }
      this.orbit.az -= dx * 0.006
      this.orbit.el = Math.max(0.35, Math.min(1.45, this.orbit.el + dy * 0.005))
      return
    }
    const p = this.pick(e)
    this.hover = p.instance ?? null
    this.renderer.domElement.style.cursor = p.instance || (p.rack && this.racks.get(p.rack)?.target) ? 'pointer' : ''
  }
  private onUp = (e: PointerEvent) => {
    if (this.drag && this.drag.moved < 6) {
      const p = this.pick(e)
      if (this.selected && p.rack && this.racks.get(p.rack)?.target) this.opts.onPickRack(p.rack)
      else if (p.instance) this.opts.onPickInstance(p.instance === this.selected ? null : p.instance)
      else this.opts.onPickInstance(null)
    }
    this.drag = null
  }
  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.orbit.distT = Math.max(14, Math.min(70, this.orbit.distT * (1 + e.deltaY * 0.0012)))
  }
}

export { DARK_PALETTE, LIGHT_PALETTE }
