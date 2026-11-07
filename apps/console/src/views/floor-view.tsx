import { useState } from 'react'
import { BoxIcon, OctagonAlertIcon, Table2Icon, TriangleAlertIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { BAND_BORDER, bandOf } from '@/components/floor/bands'
import { Floor3D } from '@/components/floor/floor-3d'
import {
  HALL_NAME,
  INLET_CRIT_C,
  INLET_WARN_C,
  PREVIEW_RACKS,
  PREVIEW_UNITS,
  type PreviewRack,
  type PreviewUnit,
} from '@/components/floor/sample'
import { cn } from '@/lib/utils'

type Mode = 'table' | '3d'
const MODE_KEY = 'mesa:floor-mode'

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === '3d' ? '3d' : 'table'
  } catch {
    return 'table' // storage blocked: start in table mode
  }
}

export function FloorView() {
  const rows = [...new Set(PREVIEW_RACKS.map(r => r.row))].sort()
  const [mode, setModeState] = useState<Mode>(readMode)

  function setMode(m: Mode) {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m) // remember this viewer's choice across reloads
    } catch {
      // storage blocked: the choice just isn't remembered
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{HALL_NAME}, rack inlet temperature.</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="warning" size="sm">Preview</Badge>
            <span>Sample readings. Live updates from the shared database arrive with Phase 2.</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ul className="flex flex-wrap items-center gap-2 text-xs" aria-label="Temperature bands">
              <li className="text-muted-foreground">Normal under {INLET_WARN_C}°C</li>
              <li><Badge variant="warning-light" size="lg">{INLET_WARN_C}–{INLET_CRIT_C}°C</Badge></li>
              <li><Badge variant="destructive-light" size="lg">{INLET_CRIT_C}°C and over</Badge></li>
            </ul>
            <ModeSwitch mode={mode} onChange={setMode} />
          </div>
        </div>

        {mode === '3d' ? (
          <Floor3D racks={PREVIEW_RACKS} rows={rows} />
        ) : (
          <div className="flex flex-col gap-3" role="list" aria-label={`${HALL_NAME} racks`}>
            {rows.map(row => (
              <div key={row} className="flex items-center gap-3" role="listitem">
                <span className="w-6 shrink-0 text-center font-mono text-sm text-muted-foreground">{row}</span>
                <div className="grid flex-1 grid-cols-3 gap-3 sm:grid-cols-6">
                  {PREVIEW_RACKS.filter(r => r.row === row)
                    .sort((a, b) => a.col - b.col)
                    .map(r => <RackTile key={r.assetId} rack={r} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        <section aria-labelledby="cooling-power" className="flex flex-col gap-3">
          <h3 id="cooling-power" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Cooling and power
          </h3>
          <ul className="flex flex-wrap gap-2">
            {PREVIEW_UNITS.map(u => <UnitChip key={u.assetId} unit={u} />)}
          </ul>
        </section>
      </div>
    </div>
  )
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options = [
    { id: 'table' as const, label: 'Table', icon: Table2Icon },
    { id: '3d' as const, label: '3D', icon: BoxIcon },
  ]
  return (
    <div role="group" aria-label="Floor view mode" className="ml-auto inline-flex rounded-lg border bg-card p-0.5">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          onClick={() => onChange(id)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
            mode === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

function RackTile({ rack }: { rack: PreviewRack }) {
  const band = bandOf(rack.inletC)
  return (
    <div
      className={cn('flex flex-col gap-1 rounded-lg border-2 bg-card px-3 py-2.5', BAND_BORDER[band])} // only the border carries the band; 2px so it reads at a glance
      aria-label={`${rack.assetId}, ${rack.inletC.toFixed(1)} degrees${band === 'normal' ? '' : `, ${band}`}`}
    >
      <span className="font-mono text-xs text-muted-foreground">{rack.assetId}</span>
      <span className="flex items-center gap-1 font-mono text-lg font-semibold tabular-nums">
        {rack.inletC.toFixed(1)}°
        {band === 'warm' && <TriangleAlertIcon className="size-3.5 text-warning" aria-hidden="true" />} {/* icon backs up color, never color alone */}
        {band === 'hot' && <OctagonAlertIcon className="size-3.5 text-destructive" aria-hidden="true" />}
      </span>
    </div>
  )
}

function UnitChip({ unit }: { unit: PreviewUnit }) {
  const cooling = unit.kind === 'cooling'
  return (
    <li>
      <Badge
        size="xl"
        variant={!unit.ok ? 'destructive-light' : cooling ? 'success-light' : 'secondary'}
        className={cn(!cooling && 'font-mono')} // power loads read as numbers, so mono like the mockup
      >
        {unit.assetId} · {unit.status}
      </Badge>
    </li>
  )
}
