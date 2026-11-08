import { useMemo, useState } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import us from 'us-atlas/states-albers-10m.json'
import type { Site, Status } from './data'

// us-atlas "albers" files are pre-projected into a 975 × 610 frame; this projection places lat/lon in the same frame.
const W = 975, H = 610
const project = geoAlbersUsa().scale(1300).translate([W / 2, H / 2])
const topo = us as unknown as Topology<{ states: GeometryCollection; nation: GeometryCollection }>

// Label placement per site, so close pins (Spartanburg and North Carolina) don't overlap. Default: to the right.
const LABEL: Record<string, { dx: number; dy: number; end: boolean }> = {
  'north-carolina': { dx: -18, dy: -44, end: true }, // above-left
  spartanburg: { dx: 18, dy: 34, end: false }, // below-right, clear of Dallas
}

const TONE: Record<Status, string> = { ok: 'var(--success)', warn: 'var(--warning)', crit: 'var(--destructive)' }

export interface SitePin {
  site: Site
  status: Status
  hot: number
}

// Compact mode crops to the part of the map that holds the sites (Texas to the Carolinas), so pins stay readable in a small tile.
const CROP = { x: 390, y: 235, w: 520, h: 300 }

/** US map with one pin per site, coloured by the site's worst status. */
export function SitesMap({ pins, onOpen, compact, selected }: { pins: SitePin[]; onOpen: (id: string) => void; compact?: boolean; selected?: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const { states, borders, nation } = useMemo(() => {
    const path = geoPath() // the geometry is already projected
    return {
      states: path(feature(topo, topo.objects.states)) ?? '',
      borders: path(mesh(topo, topo.objects.states, (a, b) => a !== b)) ?? '',
      nation: path(feature(topo, topo.objects.nation)) ?? '',
    }
  }, [])

  return (
    <svg viewBox={compact ? `${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}` : `0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Map of NMC² sites in the United States">
      <path d={states} className="fill-[#e2ded5] dark:fill-[#26262b]" />
      <path d={borders} fill="none" className="stroke-[#f7f5f1] dark:stroke-[#141416]" strokeWidth={1.2} strokeLinejoin="round" />
      <path d={nation} fill="none" className="stroke-[#cfc9bd] dark:stroke-[#34343a]" strokeWidth={1} />
      {pins.map(({ site, status, hot }) => {
        const xy = project([site.lon, site.lat])
        if (!xy) return null
        const [x, y] = xy
        const on = hover === site.id
        const at = LABEL[site.id] ?? { dx: 20, dy: -6, end: false }
        return (
          <g
            key={site.id}
            transform={`translate(${x},${y})`}
            role="button"
            tabIndex={0}
            aria-label={`${site.name}. Open`}
            className="cursor-pointer outline-none"
            onClick={() => onOpen(site.id)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen(site.id)}
            onMouseEnter={() => setHover(site.id)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{`${site.name}${hot ? ` · ${hot} servers hot` : ''}`}</title>
            {status !== 'ok' && <circle r={compact ? 21 : 20} fill={TONE[status]} opacity={0.18} className="animate-pulse" />}
            {compact && selected === site.id && <circle r={19} fill="none" stroke="var(--muted-foreground)" strokeWidth={2.5} />} {/* thin ring marks the open site */}
            <circle r={compact ? (on ? 14 : 12) : on ? 13 : 11} fill={TONE[status]} stroke="var(--card)" strokeWidth={2.5 * (compact ? 1.4 : 1)} /> {/* solid pin with a white edge */}
            {!compact && <g transform={`translate(${at.dx},${at.dy})`} textAnchor={at.end ? 'end' : 'start'}>
              <text className="fill-foreground text-[22px] font-semibold">{site.name}</text>
              {hot > 0 && <text y={22} className="fill-muted-foreground text-[15px]">{hot} hot</text>}
            </g>}
          </g>
        )
      })}
    </svg>
  )
}
