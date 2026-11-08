import * as THREE from 'three'
import { SITES } from '@/components/floor/data'
import { rowLetters } from '@/components/floor/names'
import { LIGHT_PALETTE, type ScenePalette } from '@/components/floor/scene'
import { RACK_SLOTS, type RackVM } from './use-cluster'

// The Cluster view's 3D: every site as a column of floors, seen from one fixed front view (docs/cluster-stack.html is
// the prototype). A floor is one telemetry data center: its 2 racks are 2 rows of 3 blocks, each block drawn as 6 server
// bars, like the Floor page. The simulated instances sit on bars of their rack (5 slots per rack, spread over its 3
// blocks), coloured by service tier. When an instance's rack changes in the data (a live migration, by hand or by the
// rules) it flies there along a line in its colour; the bar it left stays grey until it lands. Moves are always drawn
// on top, so no block can hide one.

export const TIER_COLOR: Record<string, string> = { edge: '#5b6cf0', app: '#84cc16', data: '#ec4899', ml: '#0ea5e9', platform: '#a855f7' }
const OTHER_TIER = '#64748b'
const ACCENT = '#ffffff' // a free slot the selected instance can move to: lights up white
const STALE = '#8a8a93'

const HH = 2.2 // block height, as on the Floor page
const BAR_Y = 0.66 // a bar's resting height in its block
const BAR = { w: 0.34, h: 1.3, d: 3.7 }
const TOP = 1.5 // where a move leaves and lands, just above the bars
const FLOOR_H = 10 // floor to floor: room for the blocks, their labels and clear air
const PLATE = { w: 17, d: 15.2 } // a floor's slab: 3 × 2 blocks with a margin
const HALL_POS = Array.from({ length: 6 }, (_, i) => [-5.2 + 5.2 * (i % 3), i < 3 ? -3.7 : 3.7] as const)
const RACK_X = (r: number) => -1.55 + r * 0.62
// Column placement per site (Spartanburg sits lower; tuned in the prototype). Extra sites line up to the right.
const SITE_X = [-23, 3, 28]
const SITE_Y = [-9, 0, 0]
// One fixed view: low and from the front-right, so the columns sit apart and each floor clears the one below it.
const VIEW_DIR = new THREE.Vector3(0.42, 0.5, 1).normalize()
const FLY_MS = 1400
const FADE_MS = 1400
const SEGS = 64 // trail segments, drawn progressively (36 indices each: 6 radial sides)

/** Where slot k of a rack sits: which of its 3 blocks, and which of that block's 6 bars. */
const slotSpot = (k: number) => ({ block: k % 3, bar: k < 3 ? 1 : 4 })

export interface StackOptions {
  onPickInstance: (id: string | null) => void
  onPickRack: (id: string) => void
  /** An instance dragged and dropped on a rack. */
  onDropInstance: (id: string, rackId: string) => void
}

interface BlockObj {
  tag: string
  rackId: string
  g: THREE.Group
  bars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>[]
  band: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  label: HTMLDivElement
  dot: HTMLElement
}
interface RackObj {
  id: string
  cab: string
  vm: RackVM
  blocks: BlockObj[]
  slots: (string | null)[]
  target: boolean
}
interface InstObj {
  id: string
  service: string
  state: string
  rackId: string
  slot: number
  flying: boolean
}
interface Flight {
  inst: InstObj
  color: string
  t0: number
  curve: THREE.QuadraticBezierCurve3
  packet: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  trail: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  tag: HTMLDivElement
  left: string // "rack:slot" it left, grey until it lands
  landed: number | null
}

const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
const key = (rack: string, slot: number) => `${rack}:${slot}`

export class StackScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 800) // orthographic: every floor the same size
  private world: THREE.Group | null = null
  private lights: THREE.Light[] = []
  private racks = new Map<string, RackObj>()
  private insts = new Map<string, InstObj>()
  private tiers = new Map<string, string>()
  private flights: Flight[] = []
  private barMeshes: THREE.Mesh[] = []
  private shells: THREE.Mesh[] = []
  private labelsFixed: { el: HTMLElement; at: THREE.Vector3; dy: number; tilt: boolean; anchor: string }[] = []
  private leaving = new Set<string>()
  private incoming = new Set<string>()
  private palette: ScenePalette = LIGHT_PALETTE
  private latest: RackVM[] = []
  private signature = ''
  private loaded = false
  private selected: string | null = null
  private hoverRack: string | null = null
  private hoverInst: string | null = null
  private pending: { id: string; x: number; y: number } | null = null
  private dragging: string | null = null
  private ghost: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | null = null
  private target = new THREE.Vector3()
  private dir = VIEW_DIR
  private dragPlane = new THREE.Plane()
  private edgeAngle = 0
  private size = { w: 0, h: 0 }
  private raf = 0
  private ro: ResizeObserver
  private ray = new THREE.Raycaster()
  private v = new THREE.Vector3()
  private host: HTMLElement
  private labels: HTMLElement
  private opts: StackOptions
  private tip: HTMLDivElement
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  private reduceMotion = this.motionQuery.matches
  private onMotionPref = () => { this.reduceMotion = this.motionQuery.matches }

  constructor(host: HTMLElement, labels: HTMLElement, opts: StackOptions) {
    this.motionQuery.addEventListener('change', this.onMotionPref)
    this.host = host
    this.labels = labels
    this.opts = opts
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    const cv = this.renderer.domElement
    cv.className = 'absolute inset-0 block size-full touch-none'
    host.prepend(cv)
    cv.addEventListener('pointerdown', this.onDown)
    cv.addEventListener('pointermove', this.onMove)
    cv.addEventListener('pointerup', this.onUp)
    cv.addEventListener('pointerleave', this.onLeave)
    this.tip = document.createElement('div')
    this.tip.className = 'pointer-events-none absolute top-0 left-0 z-10 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background'
    labels.append(this.tip)
    this.ro = new ResizeObserver(() => this.frame())
    this.ro.observe(host)
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

  /** service id → tier, for the bar colours. */
  setTiers(tiers: Map<string, string>) {
    this.tiers = tiers
  }

  /** The selected instance (or null) and the racks it may move to. */
  setSelection(instanceId: string | null, targets: Set<string>) {
    this.selected = instanceId
    for (const r of this.racks.values()) {
      r.target = targets.has(r.id)
      r.blocks.forEach(b => b.label.classList.toggle('ring-2', r.target))
    }
  }

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

  colorOf(service: string) {
    return TIER_COLOR[this.tiers.get(service) ?? ''] ?? OTHER_TIER
  }

  // ── build ──

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
    this.flights = []
    this.barMeshes = []
    this.shells = []
    this.labelsFixed = []
    this.leaving.clear()
    this.incoming.clear()
    this.loaded = false
    this.labels.replaceChildren(this.tip)
  }

  private build(racks: RackVM[]) {
    this.clearWorld()
    const t = this.palette
    const world = new THREE.Group()
    this.world = world
    this.scene.add(world)
    const hemi = new THREE.HemisphereLight(t.sky, t.gnd, t.amb)
    const sun = new THREE.DirectionalLight('#ffffff', t.sun)
    sun.position.set(-20, 40, 18)
    this.scene.add(hemi, sun)
    this.lights = [hemi, sun]

    const edge = new THREE.LineBasicMaterial({ color: t.edge, transparent: true, opacity: t.edgeOp })
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, edges: THREE.LineBasicMaterial | null = edge) => {
      const g = new THREE.BoxGeometry(w, h, d)
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(x, y, z)
      parent.add(mesh)
      if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), edges))
      return mesh
    }
    const letters = rowLetters(racks.map(r => r.id))
    const sites = SITES.map(s => ({ name: s.name, floors: s.floors.map(dcs => racks.filter(r => dcs.includes(r.datacenterId)).sort((a, b) => a.id.localeCompare(b.id))) }))
      .filter(s => s.floors.some(f => f.length))

    sites.forEach((s, si) => {
      const sx = SITE_X[si] ?? 28 + (si - 2) * 25, sy = SITE_Y[si] ?? 0
      s.floors.forEach((floorRacks, fi) => {
        const f = new THREE.Group()
        f.position.set(sx, sy + fi * FLOOR_H, 0)
        world.add(f)
        box(PLATE.w, 0.3, PLATE.d, new THREE.MeshLambertMaterial({ color: t.plinth }), 0, 0, 0, f) // the floor slab
        this.fixedLabel(`F${fi + 1}`, new THREE.Vector3(sx - PLATE.w * 0.36, sy + fi * FLOOR_H - 0.15, PLATE.d / 2), 'text-[11px] font-semibold text-muted-foreground', 4, true)
        floorRacks.slice(0, 2).forEach((vm, row) => {
          const rack: RackObj = { id: vm.id, cab: vm.cab, vm, blocks: [], slots: Array(RACK_SLOTS).fill(null), target: false }
          this.racks.set(vm.id, rack)
          for (let b = 0; b < 3; b++) {
            const [x, z] = HALL_POS[row * 3 + b]
            const g = new THREE.Group()
            g.position.set(x, 0.15, z)
            f.add(g)
            const shell = box(4.3, HH, 5, new THREE.MeshBasicMaterial(), 0, HH / 2, 0, g, null)
            shell.visible = false // no glass: the hidden box only catches clicks and drops on the block
            shell.userData = { rack: vm.id }
            this.shells.push(shell)
            const bars = Array.from({ length: 6 }, (_, k) => {
              const m = box(BAR.w, BAR.h, BAR.d, new THREE.MeshLambertMaterial({ color: this.freeColor(), emissive: new THREE.Color(ACCENT), emissiveIntensity: 0 }), RACK_X(k), BAR_Y, 0, g, null)
              const slot = [0, 1, 2, 3, 4].find(s => slotSpot(s).block === b && slotSpot(s).bar === k)
              m.userData = { rack: vm.id, slot: slot ?? -1 }
              this.barMeshes.push(m)
              return m as THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>
            })
            const band = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.14, 5.12), new THREE.MeshBasicMaterial({ color: t.ok }))
            band.position.y = 0.08 // the status rim, as on the Floor page
            g.add(band)
            const label = document.createElement('div')
            label.className = 'absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap rounded-full border bg-card px-1.5 py-px text-[10px] font-semibold text-foreground ring-primary'
            const dot = document.createElement('i')
            dot.className = 'inline-block size-1.5 rounded-full'
            label.append(dot, `${letters.get(vm.id) ?? '?'}${b + 1}`)
            this.labels.append(label)
            rack.blocks.push({ tag: `${letters.get(vm.id) ?? '?'}${b + 1}`, rackId: vm.id, g, bars, band, label, dot })
          }
        })
      })
      this.fixedLabel(s.name, new THREE.Vector3(sx, sy - 0.15, PLATE.d / 2), 'text-sm font-semibold text-foreground', 2, true)
    })

    this.scene.updateMatrixWorld(true)
    this.frame()
    this.sync(racks)
    this.loaded = true
  }

  private fixedLabel(text: string, at: THREE.Vector3, cls: string, dy: number, tilt: boolean) {
    const el = document.createElement('div')
    el.className = `absolute left-0 top-0 origin-top-left whitespace-nowrap ${cls}`
    el.textContent = text
    this.labels.append(el)
    this.labelsFixed.push({ el, at, dy, tilt, anchor: 'translate(-50%, 2px)' })
  }

  private freeColor() {
    return this.palette === LIGHT_PALETTE ? '#2b2b2e' : '#4a4a52'
  }
  private leavingColor() {
    return this.palette === LIGHT_PALETTE ? '#b4b1aa' : '#6b6b73'
  }
  private rackColor(status: RackVM['status']) {
    const t = this.palette
    return status === 'ready' ? t.ok : status === 'warm' ? t.warn : status === 'incident' ? t.crit : STALE
  }

  // ── data ──

  /** Reconcile instances with the data: place new ones, update states, and fly the ones whose rack changed. */
  private sync(racks: RackVM[]) {
    const seen = new Set<string>()
    for (const r of racks) {
      const rack = this.racks.get(r.id)
      if (!rack) continue
      rack.vm = r
      const word = { ready: 'Ready', warm: 'Warm', incident: 'Incident', stale: 'Silent' }[r.status]
      for (const b of rack.blocks) {
        b.band.material.color.set(this.rackColor(r.status))
        b.dot.style.background = this.rackColor(r.status)
        b.label.title = `Block ${b.tag} (rack ${r.cab}): ${word}, hottest GPU ${r.gpuMaxC.toFixed(1)} °C`
      }
      for (const i of r.instances) {
        seen.add(i.id)
        const cur = this.insts.get(i.id)
        if (!cur) {
          const slot = this.takeSlot(rack, i.id)
          this.insts.set(i.id, { id: i.id, service: i.service, state: i.state, rackId: r.id, slot, flying: false })
        } else {
          cur.state = i.state
          if (cur.rackId !== r.id) this.move(cur, rack)
        }
      }
    }
    for (const [id, i] of [...this.insts]) {
      if (!seen.has(id)) {
        this.free(i)
        this.insts.delete(id)
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

  private barOf(rackId: string, slot: number) {
    const rack = this.racks.get(rackId)
    if (!rack) return null
    const { block, bar } = slotSpot(slot)
    return rack.blocks[block]?.bars[bar] ?? null
  }
  private barTop(rackId: string, slot: number) {
    const bar = this.barOf(rackId, slot)
    return bar ? bar.parent!.localToWorld(new THREE.Vector3(bar.position.x, TOP, 0)) : new THREE.Vector3()
  }

  private packet(color: string) {
    const geo = new THREE.BoxGeometry(0.34, 0.5, 0.9)
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false }))
    m.renderOrder = 11 // above the trail and every block, so it is never hidden mid-flight
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#18181b', transparent: true, opacity: 0.4, depthTest: false })))
    this.world?.add(m)
    return m
  }

  /** The instance's rack changed in the data: fly it from its old bar to a free bar on the new rack. */
  private move(i: InstObj, to: RackObj) {
    const earlier = this.flights.find(f => f.inst === i)
    if (earlier) this.endFlight(earlier)
    const from = { rack: i.rackId, slot: i.slot }
    const start = this.dragging === i.id && this.ghost ? this.ghost.position.clone() : this.barTop(from.rack, from.slot)
    this.free(i)
    const slot = this.takeSlot(to, i.id)
    i.rackId = to.id
    i.slot = slot
    if (this.reduceMotion || !this.loaded) return
    const end = this.barTop(to.id, slot)
    const color = this.colorOf(i.service)
    const c = start.clone().lerp(end, 0.5)
    c.addScaledVector(this.dir, 6 + start.distanceTo(end) * 0.35).y += 2.5 + start.distanceTo(end) * 0.16 // toward the viewer and up: an arc that never goes behind a block
    const curve = new THREE.QuadraticBezierCurve3(start, c, end)
    const trail = new THREE.Mesh(new THREE.TubeGeometry(curve, SEGS, 0.09, 6, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }))
    trail.geometry.setDrawRange(0, 0)
    trail.renderOrder = 10
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, depthTest: false }))
    ring.rotation.x = -Math.PI / 2
    ring.renderOrder = 10
    const blk = to.blocks[slotSpot(slot).block].g
    ring.position.copy(blk.getWorldPosition(new THREE.Vector3())).y += 0.25
    const packet = this.packet(color)
    packet.position.copy(start)
    this.world?.add(trail, ring)
    const tag = document.createElement('div')
    tag.className = 'pointer-events-none absolute top-0 left-0 z-[3] flex items-center gap-1.5 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background'
    tag.innerHTML = `<i class="inline-block size-2 rounded-sm" style="background:${color}"></i><span>${i.service} · moving</span>`
    this.labels.append(tag)
    const left = key(from.rack, from.slot)
    this.leaving.add(left)
    this.incoming.add(key(to.id, slot))
    i.flying = true
    this.flights.push({ inst: i, color, t0: performance.now(), curve, packet, trail, ring, tag, left, landed: null })
  }

  private endFlight(f: Flight) {
    for (const m of [f.trail, f.ring, f.packet]) {
      this.world?.remove(m)
      m.geometry.dispose()
      m.material.dispose()
    }
    f.tag.remove()
    this.leaving.delete(f.left)
    this.incoming.delete(key(f.inst.rackId, f.inst.slot))
    f.inst.flying = false
    this.flights = this.flights.filter(x => x !== f)
  }

  // ── camera: one fixed view that frames every site and floor ──

  private frame() {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    this.size = { w, h }
    this.renderer.setSize(w, h, false)
    const ys: number[] = [], xs: number[] = []
    for (const r of this.racks.values()) {
      const p = r.blocks[0]?.g.parent?.position
      if (p) { xs.push(p.x); ys.push(p.y) }
    }
    if (!xs.length) return
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    this.target.set(0, (minY + maxY) / 2 + 1, 0)
    this.camera.position.copy(this.target).addScaledVector(this.dir, 200)
    this.camera.lookAt(this.target)
    this.camera.updateMatrixWorld()
    this.dragPlane.setFromNormalAndCoplanarPoint(this.dir, this.target)
    const inv = this.camera.matrixWorldInverse, p = new THREE.Vector3()
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let k = 0; k < xs.length; k++) for (const dy of [0, 5]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      p.set(xs[k] + (sx * PLATE.w) / 2, ys[k] + dy, (sz * PLATE.d) / 2).applyMatrix4(inv)
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
    }
    y0 -= 3.5 // room for the site names
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    let hw = ((x1 - x0) / 2) * 1.04, hh = ((y1 - y0) / 2) * 1.06
    if (hw / hh > w / h) hh = hw / (w / h)
    else hw = hh * (w / h)
    Object.assign(this.camera, { left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh })
    this.camera.updateProjectionMatrix()
    // the on-screen slope of a slab's front edge, so floor and site labels can sit along it
    const a = new THREE.Vector3(-1, 0, 0).project(this.camera), b = new THREE.Vector3(1, 0, 0).project(this.camera)
    this.edgeAngle = Math.atan2(-(b.y - a.y) * h, (b.x - a.x) * w)
  }

  private place(el: HTMLElement, p: THREE.Vector3, dy = 0, anchor = 'translate(-50%, -100%)') {
    this.v.copy(p).project(this.camera)
    el.style.transform = `translate(${(((this.v.x + 1) / 2) * this.size.w).toFixed(1)}px, ${(((1 - this.v.y) / 2) * this.size.h + dy).toFixed(1)}px) ${anchor}`
  }

  // ── frame loop ──

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    if (!this.world) return

    for (const f of [...this.flights]) {
      if (f.landed === null) {
        const u = Math.min(1, (now - f.t0) / FLY_MS)
        const e = easeInOut(u)
        f.curve.getPoint(e, f.packet.position)
        f.trail.geometry.setDrawRange(0, Math.max(6, Math.floor(e * SEGS)) * 36) // the line grows behind the packet
        if (u >= 1) {
          f.landed = now
          this.leaving.delete(f.left)
          this.incoming.delete(key(f.inst.rackId, f.inst.slot))
          f.inst.flying = false
          f.packet.visible = false
          const bar = this.barOf(f.inst.rackId, f.inst.slot)
          if (bar) bar.scale.y = 1.35 // a small pop as it lands
          f.tag.lastElementChild!.textContent = `${f.inst.service} · landed`
        }
      } else {
        const q = Math.min(1, (now - f.landed) / FADE_MS), out = 1 - (1 - q) ** 3
        f.trail.material.opacity = 0.95 * (1 - out)
        f.ring.material.opacity = 0.9 * (1 - q)
        f.ring.scale.setScalar(0.5 + 0.9 * out)
        f.tag.style.opacity = String(Math.max(0, 1 - Math.max(0, q - 0.4) / 0.6))
        if (q >= 1) this.endFlight(f)
      }
    }

    // bars: service colour, grey where a service just left, blue pulse on free slots the selection can move to
    const pulse = 0.35 + 0.25 * Math.sin(now / 260), bob = Math.sin(now / 220) * 0.06
    for (const rack of this.racks.values()) {
      for (const blk of rack.blocks) {
        blk.bars.forEach(bar => {
          const slot = bar.userData.slot as number
          const id = slot >= 0 ? rack.slots[slot] : null
          const inst = id ? this.insts.get(id) : undefined
          const k = key(rack.id, slot)
          const m = bar.material
          let height = 1, lift = 0
          m.emissiveIntensity = 0
          if (inst && !this.incoming.has(k)) {
            m.color.set(this.colorOf(inst.service))
            if (inst.state === 'throttled') height = 0.55 // capped power: a shorter bar
            if (inst.state === 'patching' && !this.reduceMotion) { m.emissive.set('#ffffff'); m.emissiveIntensity = 0.25 + 0.2 * Math.sin(now / 200) }
            if (inst.id === this.selected && !this.dragging) lift = 0.45 + (this.reduceMotion ? 0 : bob) // the picked service rises out of its block
          } else if (this.leaving.has(k)) {
            m.color.set(this.leavingColor())
          } else if (slot >= 0 && !id && rack.target) {
            m.color.set(ACCENT); m.emissive.set(ACCENT)
            m.emissiveIntensity = this.hoverRack === rack.id ? 0.6 : this.reduceMotion ? 0.4 : pulse
          } else {
            m.color.set(this.freeColor())
          }
          const rest = BAR_Y - BAR.h / 2 + (BAR.h * height) / 2 // a shorter bar still stands on the floor
          bar.scale.y += (height - bar.scale.y) * 0.15
          bar.position.y += (rest + lift - bar.position.y) * 0.25
        })
      }
    }

    this.renderer.render(this.scene, this.camera)

    for (const rack of this.racks.values()) for (const b of rack.blocks) this.place(b.label, b.g.getWorldPosition(this.v).add(new THREE.Vector3(0, HH + 0.3, 0)))
    for (const l of this.labelsFixed) this.place(l.el, l.at, l.dy, l.tilt ? `rotate(${this.edgeAngle}rad) ${l.anchor}` : l.anchor)
    for (const f of this.flights) this.place(f.tag, f.landed === null ? f.packet.position : f.curve.v2, -12)
    const hov = this.hoverInst ? this.insts.get(this.hoverInst) : undefined
    if (hov && !hov.flying && !this.dragging) {
      const bar = this.barOf(hov.rackId, hov.slot)
      this.tip.textContent = `${hov.service} · ${hov.id} · ${hov.state} · rack ${this.racks.get(hov.rackId)?.cab ?? ''}`
      this.tip.style.display = 'block'
      if (bar) this.place(this.tip, bar.parent!.localToWorld(new THREE.Vector3(bar.position.x, TOP + 0.6, 0)), -6)
    } else this.tip.style.display = 'none'
  }

  // ── pointer: pick, drag, drop ──

  private cast(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera)
  }
  private hit() {
    const bar = this.ray.intersectObjects(this.barMeshes, false)[0]?.object
    const rackId = (bar?.userData.rack as string | undefined) ?? (this.ray.intersectObjects(this.shells, false)[0]?.object.userData.rack as string | undefined)
    const slot = bar ? (bar.userData.slot as number) : -1
    const instance = bar && rackId && slot >= 0 ? (this.racks.get(rackId)?.slots[slot] ?? undefined) : undefined
    return { rack: rackId ?? null, instance: instance && !this.insts.get(instance)?.flying ? instance : null }
  }
  private onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId)
    this.cast(e)
    const { instance } = this.hit()
    this.pending = instance ? { id: instance, x: e.clientX, y: e.clientY } : null
  }
  private onMove = (e: PointerEvent) => {
    this.cast(e)
    if (this.pending && !this.dragging && Math.hypot(e.clientX - this.pending.x, e.clientY - this.pending.y) > 6) {
      this.dragging = this.pending.id // start dragging the service
      if (this.selected !== this.dragging) this.opts.onPickInstance(this.dragging)
      const inst = this.insts.get(this.dragging)
      if (inst) {
        this.ghost = this.packet(this.colorOf(inst.service))
        this.ghost.position.copy(this.barTop(inst.rackId, inst.slot))
      }
    }
    const { rack, instance } = this.hit()
    if (this.dragging) {
      const p = new THREE.Vector3()
      if (this.ghost && this.ray.ray.intersectPlane(this.dragPlane, p)) this.ghost.position.lerp(p, 0.6)
      this.hoverRack = rack
      this.hoverInst = null
      this.renderer.domElement.style.cursor = 'grabbing'
      return
    }
    this.hoverRack = this.selected ? rack : null
    this.hoverInst = instance
    this.renderer.domElement.style.cursor = instance || (rack && this.racks.get(rack)?.target) ? 'pointer' : ''
  }
  private onUp = (e: PointerEvent) => {
    this.cast(e)
    const { rack, instance } = this.hit()
    if (this.dragging) {
      const id = this.dragging
      if (rack && rack !== this.insts.get(id)?.rackId) this.opts.onDropInstance(id, rack)
      if (this.ghost) {
        this.world?.remove(this.ghost)
        this.ghost.geometry.dispose()
        this.ghost.material.dispose()
        this.ghost = null
      }
      this.dragging = null
      this.pending = null
      this.hoverRack = null
      this.renderer.domElement.style.cursor = ''
      return
    }
    this.pending = null
    if (instance) this.opts.onPickInstance(instance === this.selected ? null : instance)
    else if (this.selected && rack && this.racks.get(rack)?.target) this.opts.onPickRack(rack)
    else this.opts.onPickInstance(null)
  }
  private onLeave = () => {
    this.hoverInst = null
    this.hoverRack = null
  }
}
