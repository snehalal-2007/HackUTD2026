import { useId, useState, type ComponentProps, type ReactNode } from 'react'
import { CheckIcon, CircleAlertIcon, CircleIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PASSWORD_RULES } from './validation'

type FieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  label: string
  hint?: ReactNode
  error?: string
  aside?: ReactNode // e.g. a "Forgot password?" link next to the label
}

/** Label, input, hint and error wired together for screen readers. */
export function Field({ label, hint, error, aside, className, ...input }: FieldProps) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {aside}
      </div>
      <Input id={id} aria-invalid={!!error} aria-describedby={describedBy} className="h-10 bg-background" {...input} />
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
      <CircleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  )
}

/** Password input with a show/hide button. Never logs or stores the value. */
export function PasswordField({ label = 'Password', ...props }: Omit<FieldProps, 'type' | 'label'> & { label?: string }) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  const { error, hint, aside, className, ...input } = props
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {aside}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="h-10 bg-background pr-10"
          spellCheck={false}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {visible ? <EyeOffIcon className="size-4" aria-hidden="true" /> : <EyeIcon className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}

/** Live checklist under a new-password field: icon plus text, not color alone. */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="grid gap-1 text-xs sm:grid-cols-2" aria-label="Password requirements">
      {PASSWORD_RULES.map(r => {
        const ok = r.test(value)
        return (
          <li key={r.id} className={cn('flex items-center gap-1.5', ok ? 'text-success-foreground dark:text-success' : 'text-muted-foreground')}>
            {ok ? <CheckIcon className="size-3.5" aria-hidden="true" /> : <CircleIcon className="size-3" aria-hidden="true" />}
            <span>{r.label}<span className="sr-only">{ok ? ' (met)' : ' (not met)'}</span></span>
          </li>
        )
      })}
    </ul>
  )
}

/** Shown after a valid submit, instead of pretending to sign in. */
export function SubmittedNote({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground dark:text-warning">
      {children}
    </div>
  )
}

type SelectFieldProps = Omit<ComponentProps<'select'>, 'id'> & {
  label: string
  hint?: ReactNode
  error?: string
  options: readonly string[]
  placeholder?: string
}

/** Native select styled like Input: keyboard and screen-reader friendly with no extra dependency. */
export function SelectField({ label, hint, error, options, placeholder = 'Select…', className, ...select }: SelectFieldProps) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30"
        {...select}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}
