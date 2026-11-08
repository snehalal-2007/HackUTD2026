import { useCallback, useState, type FormEvent } from 'react'
import { ArrowLeftIcon, CheckIcon, EyeIcon, KeyRoundIcon, PenLineIcon, ShieldCheckIcon, TypeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Field, FieldError } from '../components/fields'
import { formatDate, place, type Onboarding } from './onboarding'
import { SignaturePad } from './signature-pad'

const ACCESS = [
  {
    Icon: EyeIcon,
    title: 'Read-only telemetry',
    body: 'Power, cooling, temperature and humidity readings from the source you chose for each site.',
  },
  {
    Icon: KeyRoundIcon,
    title: 'Asset and virtual inventory',
    body: 'Rack, power and cooling assets, plus hypervisor hosts and virtual machines, so alerts point at the right thing.',
  },
  {
    Icon: ShieldCheckIcon,
    title: 'No control of your equipment',
    body: 'MESA does not change settings, move workloads or switch power. Alerts, owners and handoffs live in MESA only.',
  },
]

/** Step 2: what MESA will access, three confirmations, and an electronic signature. */
export function AuthorizeStep({
  value,
  onBack,
  onSign,
}: {
  value: Onboarding
  onBack: () => void
  onSign: (v: Onboarding) => void
}) {
  const { admin, dataCenters } = value
  const [agree, setAgree] = useState({ authority: false, access: false, revoke: false })
  const [method, setMethod] = useState<'drawn' | 'typed'>('drawn')
  const [hasInk, setHasInk] = useState(false)
  const [typed, setTyped] = useState('')
  const [errors, setErrors] = useState<{ agree?: string; signature?: string; typed?: string }>({})
  const [today] = useState(() => new Date())
  const onInk = useCallback((v: boolean) => {
    setHasInk(v)
    if (v) setErrors(e => ({ ...e, signature: undefined }))
  }, [])
  const company = admin.company.trim().replace(/\.$/, '') // avoid “Inc..” at the end of a sentence

  const CHECKS: { key: keyof typeof agree; label: string }[] = [
    { key: 'authority', label: `I am authorized to grant access on behalf of ${company}.` },
    { key: 'access', label: `I allow MESA the read-only access described above for the ${dataCenters.length} data center${dataCenters.length === 1 ? '' : 's'} listed.` },
    { key: 'revoke', label: 'I understand I can revoke this access at any time from Organization settings.' },
  ]

  function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!Object.values(agree).every(Boolean)) errs.agree = 'Check all three boxes to continue.'
    if (method === 'drawn' && !hasInk) errs.signature = 'Sign in the box, or choose “Type instead”.'
    if (method === 'typed' && typed.trim().toLowerCase() !== admin.name.trim().toLowerCase()) errs.typed = `Type your full name exactly as entered: ${admin.name.trim()}.`
    setErrors(errs)
    if (Object.keys(errs).length === 0) onSign({ ...value, signature: { name: admin.name.trim(), signedAt: today, method } })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="access-heading">
        <h2 id="access-heading" className="text-sm font-semibold">What MESA will access</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {ACCESS.map(({ Icon, title, body }) => (
            <li key={title} className="flex flex-col gap-2 rounded-xl border border-border p-4">
              <Icon className="size-4" aria-hidden="true" />
              <span className="text-sm font-medium">{title}</span>
              <span className="text-xs text-muted-foreground">{body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="scope-heading">
        <h2 id="scope-heading" className="text-sm font-semibold">Sites covered</h2>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {dataCenters.map(d => (
            <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="font-medium">{d.name}</span>
              <span className="text-xs text-muted-foreground">
                {place(d)} · {d.racks} racks · {Number(d.coolingUnits) + Number(d.upsUnits) + Number(d.generators) + Number(d.pdus)} power and cooling assets
                {d.virtualization !== 'None' && ` · ${d.hosts} hosts, ${d.vms} VMs on ${d.virtualization}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold">Confirm</legend>
        {CHECKS.map(c => (
          <label key={c.key} className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={agree[c.key]}
              onChange={e => {
                const next = { ...agree, [c.key]: e.target.checked }
                setAgree(next)
                if (Object.values(next).every(Boolean)) setErrors(x => ({ ...x, agree: undefined }))
              }}
              className="mt-0.5 size-4 shrink-0 accent-foreground"
              aria-invalid={!!errors.agree && !agree[c.key]}
            />
            <span>{c.label}</span>
          </label>
        ))}
        {errors.agree && <FieldError>{errors.agree}</FieldError>}
      </fieldset>

      <Separator />

      <section className="flex flex-col gap-4" aria-labelledby="sign-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="sign-heading" className="text-sm font-semibold">Electronic signature</h2>
          <div role="radiogroup" aria-label="How to sign" className="flex rounded-lg border border-border p-0.5 text-xs">
            {([['drawn', 'Draw', PenLineIcon], ['typed', 'Type instead', TypeIcon]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={method === id}
                onClick={() => { setMethod(id); setErrors(e => ({ ...e, signature: undefined, typed: undefined })) }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  method === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>

        {method === 'drawn' ? (
          <>
            <SignaturePad onInk={onInk} invalid={!!errors.signature} labelledBy="sign-heading" />
            {errors.signature && <FieldError>{errors.signature}</FieldError>}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Field
              label="Type your full name"
              autoComplete="name"
              value={typed}
              onChange={e => { setTyped(e.target.value); setErrors(x => ({ ...x, typed: undefined })) }}
              error={errors.typed}
              hint={`Must match the administrator name: ${admin.name.trim()}`}
            />
            <div aria-hidden="true" className="flex h-24 items-end rounded-xl border-2 border-dashed border-border bg-background px-6 pb-4">
              <span className="w-full border-b border-muted-foreground/40 pb-1 font-serif text-3xl italic">{typed || ' '}</span>
            </div>
          </div>
        )}

        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Signer</dt><dd>{admin.name.trim()}{admin.title.trim() && `, ${admin.title.trim()}`}</dd></div>
          <div><dt className="text-xs text-muted-foreground">On behalf of</dt><dd>{admin.company.trim()}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Date</dt><dd>{formatDate(today)}</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">
          By signing, you agree that your electronic signature has the same effect as a handwritten one for this access authorization.
        </p>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" size="lg" className="h-10" onClick={onBack}>
          <ArrowLeftIcon aria-hidden="true" /> Back to details
        </Button>
        <Button type="submit" size="lg" className="h-10">
          <CheckIcon aria-hidden="true" /> Sign and authorize
        </Button>
      </div>
    </form>
  )
}
