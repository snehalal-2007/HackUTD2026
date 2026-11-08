import { useState, type FormEvent } from 'react'
import { Building2Icon, PencilIcon, PlusIcon, Trash2Icon, UserRoundIcon, WarehouseIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Field, FieldError } from '../components/fields'
import { DataCenterForm } from './data-center-form'
import { emptyDataCenter, place, validateAdmin, type Admin, type DataCenter, type Errors, type Onboarding } from './onboarding'

/** Step 1: the admin, the organization, then each data center and its assets, one at a time. */
export function DetailsStep({ value, onNext }: { value: Onboarding; onNext: (v: Onboarding) => void }) {
  const [admin, setAdmin] = useState<Admin>(value.admin)
  const [centers, setCenters] = useState<DataCenter[]>(value.dataCenters)
  // The data center open in the editor: a new draft, an existing one by id, or none.
  const [editing, setEditing] = useState<DataCenter | null>(value.dataCenters.length ? null : emptyDataCenter())
  const [errors, setErrors] = useState<Errors<Admin>>({})
  const [listError, setListError] = useState('')

  const set = (k: keyof Admin) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setAdmin(a => ({ ...a, [k]: e.target.value }))
    setErrors(x => ({ ...x, [k]: undefined })) // re-checked on Continue
  }
  const f = (k: keyof Admin) => ({ value: admin[k], onChange: set(k), error: errors[k] })

  function saveCenter(d: DataCenter) {
    setCenters(list => (list.some(x => x.id === d.id) ? list.map(x => (x.id === d.id ? d : x)) : [...list, d]))
    setEditing(null)
    setListError('')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validateAdmin(admin)
    setErrors(errs)
    let list = ''
    if (editing) list = 'Save or cancel the data center you’re editing first.'
    else if (centers.length === 0) list = 'Add at least one data center.'
    setListError(list)
    if (Object.keys(errs).length === 0 && !list) onNext({ ...value, admin, dataCenters: centers })
    else (document.querySelector<HTMLElement>('[aria-invalid="true"]') ?? document.getElementById('dc-list'))?.focus()
  }

  const found = editing ? centers.findIndex(x => x.id === editing.id) : -1
  const editingIndex = found >= 0 ? found : centers.length

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <UserRoundIcon className="size-4" aria-hidden="true" /> Administrator
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" autoComplete="name" {...f('name')} />
          <Field label="Job title" hint="Optional" autoComplete="organization-title" {...f('title')} />
          <Field label="Work email address" type="email" autoComplete="email" placeholder="you@company.com" {...f('email')} />
          <Field label="Phone number" type="tel" autoComplete="tel" placeholder="+1 214 555 0142" {...f('phone')} />
        </div>
      </fieldset>

      <Separator />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Building2Icon className="size-4" aria-hidden="true" /> Organization
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name" hint="What your team sees in MESA" placeholder="e.g. North Texas Operations" {...f('organization')} />
          <Field label="Company" hint="Legal name, used on the access agreement" autoComplete="organization" placeholder="e.g. Cobalt Ridge Data, Inc." {...f('company')} />
        </div>
      </fieldset>

      <Separator />

      <section className="flex flex-col gap-4" aria-labelledby="dc-heading">
        <div className="flex flex-col gap-1">
          <h2 id="dc-heading" className="flex items-center gap-2 text-sm font-semibold">
            <WarehouseIcon className="size-4" aria-hidden="true" /> Data centers
          </h2>
          <p className="text-sm text-muted-foreground">Add each site one at a time, with the assets MESA will watch there.</p>
        </div>

        <ul id="dc-list" tabIndex={-1} className="flex flex-col gap-2 outline-none">
          {centers.map((d, i) =>
            editing?.id === d.id ? null : (
              <li key={d.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{d.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {place(d)} · {d.halls} halls · {d.racks} racks · {d.itCapacityKw} kW
                    {d.virtualization !== 'None' && ` · ${d.vms || 0} VMs`}
                  </span>
                </span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${d.name}`} disabled={!!editing} onClick={() => setEditing(d)}>
                  <PencilIcon aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${d.name}`} disabled={!!editing} onClick={() => setCenters(list => list.filter(x => x.id !== d.id))}>
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </li>
            ),
          )}
        </ul>

        {editing ? (
          <DataCenterForm
            key={editing.id}
            initial={editing}
            index={editingIndex}
            onSave={saveCenter}
            onCancel={centers.length ? () => setEditing(null) : undefined}
          />
        ) : (
          <Button type="button" variant="outline" size="lg" className="h-10 self-start" onClick={() => setEditing(emptyDataCenter())}>
            <PlusIcon aria-hidden="true" /> {centers.length ? 'Add another data center' : 'Add a data center'}
          </Button>
        )}
        {listError && <FieldError>{listError}</FieldError>}
      </section>

      <Button type="submit" size="lg" className="h-10 w-full">Continue to access authorization</Button>
    </form>
  )
}
