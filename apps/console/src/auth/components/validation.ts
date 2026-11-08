// Client-side checks for the sign-in samples. The real rules belong wherever accounts end up living.

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { id: 'case', label: 'Upper and lower case letters', test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: 'number', label: 'At least one number', test: (p: string) => /\d/.test(p) },
  { id: 'symbol', label: 'At least one symbol', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const

export function passwordOk(p: string) {
  return PASSWORD_RULES.every(r => r.test(p))
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Organization ID: 12 digits, or a lowercase alias such as `northwind-dfw`.
export const ORG_RE = /^(\d{12}|[a-z0-9][a-z0-9-]{1,61}[a-z0-9])$/
export const USERNAME_RE = /^[A-Za-z0-9._+=,@-]{2,64}$/
// Phone: digits with optional +, spaces, dashes, dots and parentheses; 7–15 digits in total.
export const PHONE_RE = /^\+?[\d\s().-]{7,24}$/
export function phoneOk(p: string) {
  const digits = p.replace(/\D/g, '')
  return PHONE_RE.test(p.trim()) && digits.length >= 7 && digits.length <= 15
}
