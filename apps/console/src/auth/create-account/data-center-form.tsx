import { useState, type ReactNode } from 'react'
import { CpuIcon, MapPinIcon, ServerIcon, ThermometerIcon, ZapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, SelectField } from '../components/fields'
import { COOLING, TELEMETRY, TIERS, validateDataCenter, VIRTUALIZATION, type DataCenter, type Errors } from './onboarding'

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {icon}
        {title}
      </legend>
      {children}
    </fieldset>
  )
}

const num = { inputMode: 'numeric' as const, autoComplete: 'off' }

/** Editor for one data center and its assets. Saves only when every required field checks out. */
export function DataCenterForm({
  initial,
  index,
  onSave,
  onCancel,
}: {
  initial: DataCenter
  index: number
  onSave: (d: DataCenter) => void
  onCancel?: () => void
}) {
  const [d, setD] = useState(initial)
  const [errors, setErrors] = useState<Errors<DataCenter>>({})
  const set = (k: keyof DataCenter) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setD(v => ({ ...v, [k]: e.target.value }))
    setErrors(x => ({ ...x, [k]: undefined })) // re-checked on Save
  }
  const f = (k: keyof DataCenter) => ({ value: d[k], onChange: set(k), error: errors[k] })
  const virtual = d.virtualization && d.virtualization !== 'None'

  function save() {
    const errs = validateDataCenter(d)
    setErrors(errs)
    if (Object.keys(errs).length === 0) onSave(d)
    else document.getElementById(`dc-${d.id}`)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }

  return (
    <div id={`dc-${d.id}`} className="flex flex-col gap-6 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Data center {index + 1}</h3>

      <Group icon={<MapPinIcon className="size-3.5" aria-hidden="true" />} title="Site">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Field label="Data center name" placeholder="e.g. Dallas DC-2" {...f('name')} />
          <SelectField label="Tier" options={TIERS} {...f('tier')} />
        </div>
        <Field label="Street address" autoComplete="street-address" {...f('street')} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City" autoComplete="address-level2" {...f('city')} />
          <Field label="State or region" hint="Optional" autoComplete="address-level1" {...f('region')} />
          <Field label="Country" autoComplete="country-name" {...f('country')} />
        </div>
      </Group>

      <Group icon={<ServerIcon className="size-3.5" aria-hidden="true" />} title="Space and racks">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Data halls" {...num} {...f('halls')} />
          <Field label="Racks" hint="Across all halls" {...num} {...f('racks')} />
          <Field label="IT capacity (kW)" inputMode="decimal" {...f('itCapacityKw')} />
        </div>
      </Group>

      <Group icon={<ZapIcon className="size-3.5" aria-hidden="true" />} title="Power">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="UPS units" {...num} {...f('upsUnits')} />
          <Field label="Generators" {...num} {...f('generators')} />
          <Field label="PDUs" {...num} {...f('pdus')} />
        </div>
      </Group>

      <Group icon={<ThermometerIcon className="size-3.5" aria-hidden="true" />} title="Cooling and limits">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cooling units" {...num} {...f('coolingUnits')} />
          <SelectField label="Cooling type" options={COOLING} {...f('coolingType')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Inlet warning limit (°C)" hint="ASHRAE recommends 27 °C" inputMode="decimal" {...f('warnC')} />
          <Field label="Inlet critical limit (°C)" inputMode="decimal" {...f('critC')} />
        </div>
      </Group>

      <Group icon={<CpuIcon className="size-3.5" aria-hidden="true" />} title="Virtual infrastructure">
        <SelectField label="Virtualization platform" options={VIRTUALIZATION} {...f('virtualization')} />
        {virtual && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Hypervisor hosts" {...num} {...f('hosts')} />
            <Field label="Virtual machines" hint="Approximate is fine" {...num} {...f('vms')} />
            <Field label="Storage (TB)" hint="Optional" inputMode="decimal" {...f('storageTb')} />
          </div>
        )}
        <SelectField
          label="Where readings come from"
          hint="The system MESA will connect to for power, cooling and environment readings."
          options={TELEMETRY}
          {...f('telemetry')}
        />
      </Group>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <Button type="button" variant="ghost" size="lg" className="h-10" onClick={onCancel}>Cancel</Button>}
        <Button type="button" size="lg" className="h-10" onClick={save}>Save data center</Button>
      </div>
    </div>
  )
}
