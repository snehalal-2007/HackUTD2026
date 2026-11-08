import * as THREE from 'three'

// The home page's cluster story scene (the docs/cluster.html design in a dark, bolder palette): three floors in a
// triangle, each the Floor page's model with six open blocks, every block holding six server bars coloured by the
// service running on them. The React side sets temperatures and placement each tick; any service whose block changes
// flies across as a glowing packet. Illustration only: no orbit, picking or live data.

export type Status = 'ok' | 'warn' | 'crit'
export interface StoryBlock { tag: string; site: number; idx: number }
export interface StorySite { name: string }
export type Placement = Record<string, { block: string; slot: number }> // instance id → where it runs

const C = {
  plinth: '#1c1d22', spine: '#26272e', unit: '#2e3038', shell: '#9aa3b5', free: '#33353d', edge: '#c9cedb',
  ok: '#22c55e', warn: '#f59e0b', crit: '#ef4444', sky: '#dfe6ff', gnd: '#0c0d10',
}
const HH = 2.2
const SLOTS = 6
const HALL_POS = Array.from({ length: 6 }, (_, i) => [-5 + 5 * (i % 3), i < 3 ? -3.6 : 3.6] as const) // the Floor page's 6-block layout
const SITE_POS = [[0, -11], [-19, 11], [19, 11]] as const // triangle: one floor at the back, two in front
const W = 7.15
const RACK_X = (r: number) => -1.55 + r * 0.62

interface BlockObj { g: THREE.Group; band: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; tint: THREE.Color; bars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>[]; label: HTMLDivElement; status: Status }
interface Flight { id: string; mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; dest: { block: string; slot: number }; t: number }

export class ClusterStoryScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500)
  private world = new THREE.Group()
  private blocks = new Map<string, BlockObj>()
  private colors: Record<string, string>
  private landed = new Map<string, { block: string; slot: number }>() // where each service is drawn right now
  private wanted = new Map<string, { block: string; slot: number }>() // where the story says it is
  private flights: Flight[] = []
  private towers: THREE.MeshBasicMaterial[] = [] // the failing site's cooling-tower rims
  private failing = false
  private siteLabels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = []
  private az = -0.5
  private raf = 0
  private last = performance.now()
  private ro: ResizeObserver
  private v = new THREE.Vector3()
  private reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private host: HTMLElement
  private labels: HTMLElement

  constructor(host: HTMLElement, labels: HTMLElement, sites: StorySite[], blocks: StoryBlock[], colors: Record<string, string>, failSite: number) {
    this.host = host
    this.labels = labels
    this.colors = colors
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.domElement.className = 'absolute inset-0 block size-full'
    host.prepend(this.renderer.domElement)
    this.scene.add(this.world)

    const hemi = new THREE.HemisphereLight(C.sky, C.gnd, 1.6)
    const sun = new THREE.DirectionalLight('#ffffff', 2.6)
    sun.position.set(-20, 40, 18)
    sun.castShadow = true
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 35, bottom: -35, near: 1, far: 120 })
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0008
    this.scene.add(hemi, sun)

    const edge = new THREE.LineBasicMaterial({ color: C.edge, transparent: true, opacity: 0.14 })
    const lam = (c: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra })
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, edges: THREE.LineBasicMaterial | null = edge) => {
      const geo = new THREE.BoxGeometry(w, h, d)
      const mesh = new THREE.Mesh(geo, m)
      mesh.position.set(x, y, z)
      mesh.castShadow = mesh.receiveShadow = true
      parent.add(mesh)
      if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edges))
      return mesh
    }
    const cyl = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    const groups = sites.map((s, si) => {
      const g = new THREE.Group()
      g.position.set(SITE_POS[si][0], 0, SITE_POS[si][1])
      this.world.add(g)
      const unit = lam(C.unit)
      box(2 * W + 19.3, 0.5, 18, lam(C.plinth), 0, -0.25, 0, g) // plinth
      box(2 * W + 0.5, 1.1, 1.5, lam(C.spine), 0, 0.55, 0, g) // spine corridor
      for (let k = 0; k < 4; k++) { // generator yard
        const z = -5.1 + k * 3.4
        box(1.3, 1, 2.4, unit, -(W + 4.95), 0.5, z, g)
        cyl(0.14, 1.2, unit, -(W + 4.55), 1.5, z - 0.7, g)
      }
      for (const z of [-3.4, 3.4]) { // cooling towers: their rims glow, and turn red on the failing site
        cyl(1.2, 1.8, unit, W + 4.75, 0.9, z, g)
        const rim = new THREE.MeshBasicMaterial({ color: '#38bdf8' })
        cyl(0.9, 0.15, rim, W + 4.75, 1.85, z, g)
        if (si === failSite) this.towers.push(rim)
      }
      box(2.2, 1.3, 2.6, unit, W + 4.75, 0.65, 0, g) // substation
      const el = document.createElement('div')
      el.className = 'absolute top-0 left-0 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-neutral-950'
      el.textContent = s.name
      labels.append(el)
      this.siteLabels.push({ el, pos: new THREE.Vector3(SITE_POS[si][0], 0, SITE_POS[si][1] + 9.6) })
      return g
    })

    for (const b of blocks) {
      const [x, z] = HALL_POS[b.idx]
      const g = new THREE.Group()
      g.position.set(x, 0.3, z)
      groups[b.site].add(g)
      box(4.3, HH, 5, lam(C.shell, { transparent: true, opacity: 0.1, depthWrite: false }), 0, HH / 2, 0, g) // open block: glass walls, no roof
      const bars = Array.from({ length: SLOTS }, (_, r) => {
        const m = box(0.34, 1.3, 3.7, lam(C.free, { emissive: new THREE.Color(C.free), emissiveIntensity: 0 }), RACK_X(r), 0.66, 0, g, null) as BlockObj['bars'][number]
        m.castShadow = m.receiveShadow = false
        return m
      })
      const band = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.14, 5.12), new THREE.MeshBasicMaterial({ color: C.ok }))
      band.position.y = 0.14
      g.add(band)
      const label = document.createElement('div')
      label.className = 'absolute top-0 left-0 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white backdrop-blur'
      labels.append(label)
      this.blocks.set(b.tag, { g, band, tint: new THREE.Color(C.ok), bars, label, status: 'ok' })
    }

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
    this.raf = requestAnimationFrame(this.tick)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.world.traverse(o => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;([] as THREE.Material[]).concat(m.material ?? []).forEach(x => x.dispose())
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.replaceChildren()
  }

  /** One tick of the story: block temperatures, where every service should be, and whether the cooling unit is down. */
  set(temps: Record<string, number>, place: Placement, failing: boolean) {
    this.failing = failing
    for (const [tag, B] of this.blocks) {
      const c = temps[tag] ?? 40
      const s: Status = c >= 55 ? 'crit' : c >= 50 ? 'warn' : 'ok'
      B.status = s
      B.tint.set(C[s])
      B.label.innerHTML = `<i style="width:7px;height:7px;border-radius:50%;background:${C[s]}"></i>${tag}${s !== 'ok' ? ` · ${c.toFixed(0)}°` : ''}`
    }
    for (const [id, where] of Object.entries(place)) {
      const prev = this.wanted.get(id)
      if (prev && prev.block === where.block && prev.slot === where.slot) continue
      this.wanted.set(id, where)
      if (!prev || this.reduce) { this.landed.set(id, where); continue } // first placement, or no motion: just appear there
      const flying = this.flights.find(f => f.id === id)
      const from = flying ? flying.mesh.position.clone() : this.barTop(prev.block, prev.slot)
      if (flying) { this.world.remove(flying.mesh); this.flights.splice(this.flights.indexOf(flying), 1) }
      this.landed.delete(id) // the source bar goes dark at once; the target lights up when the packet lands
      const geo = new THREE.BoxGeometry(0.34, 0.5, 0.9)
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.colors[id] }))
      mesh.position.copy(from)
      this.world.add(mesh)
      this.flights.push({ id, mesh, from, to: this.barTop(where.block, where.slot), dest: where, t: 0 })
    }
    this.paintBars()
  }

  private barTop(tag: string, slot: number) {
    const B = this.blocks.get(tag)!
    return B.bars[slot].localToWorld(new THREE.Vector3(0, 0, 0)).setY(B.g.position.y + 1.6)
  }

  private paintBars() {
    const at = new Map<string, string>()
    for (const [id, w] of this.landed) at.set(`${w.block}:${w.slot}`, id)
    for (const [tag, B] of this.blocks) {
      B.bars.forEach((bar, r) => {
        const id = at.get(`${tag}:${r}`)
        const c = id ? this.colors[id] : C.free
        bar.material.color.set(c)
        bar.material.emissive.set(c)
        bar.material.emissiveIntensity = id ? 0.35 : 0 // bold: services glow a little on the dark floor
      })
    }
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    if (!this.reduce) this.az += dt * 0.035 // slow turn
    const dist = 88 * Math.max(1, 1.5 / this.camera.aspect) // keep the whole triangle in frame on narrow panels
    const el = 0.78
    this.camera.position.set(dist * Math.cos(el) * Math.sin(this.az), dist * Math.sin(el), dist * Math.cos(el) * Math.cos(this.az))
    this.camera.lookAt(0, 0, 0)

    for (let k = this.flights.length - 1; k >= 0; k--) {
      const f = this.flights[k]
      f.t = Math.min(1, f.t + dt / 1.4)
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2
      f.mesh.position.lerpVectors(f.from, f.to, e)
      f.mesh.position.y += Math.sin(Math.PI * e) * Math.min(14, 3 + f.from.distanceTo(f.to) * 0.18) // arc between floors
      if (f.t >= 1) {
        this.world.remove(f.mesh)
        f.mesh.geometry.dispose()
        this.flights.splice(k, 1)
        this.landed.set(f.id, f.dest)
        this.paintBars()
      }
    }
    const blink = this.failing ? 0.5 + 0.5 * Math.sin(now / 180) : 1
    this.towers.forEach(m => m.color.set(this.failing ? C.crit : '#38bdf8').multiplyScalar(this.failing ? 0.5 + blink * 0.5 : 1))
    for (const B of this.blocks.values()) B.band.material.color.lerp(B.tint, 0.15)

    this.renderer.render(this.scene, this.camera)
    const w = this.host.clientWidth, h = this.host.clientHeight
    const place = (el: HTMLElement, p: THREE.Vector3, below = false) => {
      this.v.copy(p).project(this.camera)
      el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h + (below ? 6 : 0)}px) translate(-50%, ${below ? '0' : '-100%'})`
    }
    for (const B of this.blocks.values()) place(B.label, B.g.getWorldPosition(this.v).setY(HH + 1.4).clone())
    this.siteLabels.forEach(s => place(s.el, s.pos, true))
  }
}
