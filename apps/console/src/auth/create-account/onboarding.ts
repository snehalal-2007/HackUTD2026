import { EMAIL_RE, phoneOk } from '../components/validation'

// What a new organization tells MESA during sign-up. Kept in memory only: nothing is sent or saved yet.

export const TIERS = ['Tier I', 'Tier II', 'Tier III', 'Tier IV', 'Not certified'] as const
export const COOLING = ['Air (CRAC/CRAH)', 'In-row', 'Liquid / direct-to-chip', 'Hybrid'] as const
export const VIRTUALIZATION = ['VMware vSphere', 'Microsoft Hyper-V', 'KVM / OpenStack', 'Nutanix AHV', 'Proxmox VE', 'Other', 'None'] as const
export const TELEMETRY = ['DCIM platform', 'BMS / SCADA', 'SNMP / Redfish direct', 'CSV exports', 'Not sure yet'] as const

export interface Admin {
  name: string
  title: string
  email: string
  phone: string
  organization: string // how the organization appears in MESA
  company: string // legal company name
}

export interface DataCenter {
  id: string
  // Site
  name: string
  street: string
  city: string
  region: string
  country: string
  tier: string
  // Physical assets (the module's asset kinds: rack, cooling, power, grouped in halls)
  halls: string
  racks: string
  itCapacityKw: string
  coolingUnits: string
  coolingType: string
  upsUnits: string
  generators: string
  pdus: string
  warnC: string
  critC: string
  // Virtual assets
  virtualization: string
  hosts: string
  vms: string
  storageTb: string
  // Where MESA reads from
  telemetry: string
}

export interface Onboarding {
  admin: Admin
  dataCenters: DataCenter[]
  signature?: { name: string; signedAt: Date; method: 'drawn' | 'typed' }
}

export const EMPTY_ADMIN: Admin = { name: '', title: '', email: '', phone: '', organization: '', company: '' }

export function emptyDataCenter(): DataCenter {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: '', street: '', city: '', region: '', country: '', tier: '',
    halls: '', racks: '', itCapacityKw: '', coolingUnits: '', coolingType: '', upsUnits: '', generators: '', pdus: '',
    warnC: '27', critC: '32',
    virtualization: '', hosts: '', vms: '', storageTb: '',
    telemetry: '',
  }
}

export type Errors<T> = Partial<Record<keyof T, string>>

export function validateAdmin(a: Admin): Errors<Admin> {
  const e: Errors<Admin> = {}
  if (a.name.trim().split(/\s+/).length < 2) e.name = 'Enter your first and last name.'
  if (!EMAIL_RE.test(a.email.trim())) e.email = 'Enter a valid work email address.'
  if (!phoneOk(a.phone)) e.phone = 'Enter a phone number with country code, e.g. +1 214 555 0142.'
  if (!a.organization.trim()) e.organization = 'Enter the organization name your team will see in MESA.'
  if (!a.company.trim()) e.company = 'Enter the legal company name.'
  return e
}

const whole = (v: string, min = 0) => /^\d+$/.test(v.trim()) && Number(v) >= min
const decimal = (v: string) => /^\d+(\.\d+)?$/.test(v.trim()) && Number(v) > 0

export function validateDataCenter(d: DataCenter): Errors<DataCenter> {
  const e: Errors<DataCenter> = {}
  if (!d.name.trim()) e.name = 'Name this data center, e.g. Dallas DC-2.'
  if (!d.street.trim()) e.street = 'Enter the street address.'
  if (!d.city.trim()) e.city = 'Enter the city.'
  if (!d.country.trim()) e.country = 'Enter the country.'
  if (!d.tier) e.tier = 'Choose a tier.'
  if (!whole(d.halls, 1)) e.halls = 'At least 1.'
  if (!whole(d.racks, 1)) e.racks = 'At least 1.'
  if (!decimal(d.itCapacityKw)) e.itCapacityKw = 'Enter kW, e.g. 900.'
  if (!whole(d.coolingUnits, 1)) e.coolingUnits = 'At least 1.'
  if (!d.coolingType) e.coolingType = 'Choose a cooling type.'
  if (!whole(d.upsUnits)) e.upsUnits = 'Enter a number (0 if none).'
  if (!whole(d.generators)) e.generators = 'Enter a number (0 if none).'
  if (!whole(d.pdus, 1)) e.pdus = 'At least 1.'
  if (!decimal(d.warnC)) e.warnC = 'Enter °C.'
  if (!decimal(d.critC)) e.critC = 'Enter °C.'
  else if (decimal(d.warnC) && Number(d.critC) <= Number(d.warnC)) e.critC = 'Must be above the warning limit.'
  if (!d.virtualization) e.virtualization = 'Choose a platform, or None.'
  if (d.virtualization && d.virtualization !== 'None') {
    if (!whole(d.hosts, 1)) e.hosts = 'At least 1.'
    if (!whole(d.vms)) e.vms = 'Enter a number.'
  }
  if (d.storageTb.trim() && !decimal(d.storageTb)) e.storageTb = 'Enter TB, or leave blank.'
  if (!d.telemetry) e.telemetry = 'Choose where readings come from.'
  return e
}

/** Adds n business days (Mon–Fri). Public holidays aren't counted. */
export function addBusinessDays(from: Date, n: number) {
  const d = new Date(from)
  let left = n
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) left--
  }
  return d
}

export const formatDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

export function place(d: DataCenter) {
  return [d.city, d.region, d.country].map(s => s.trim()).filter(Boolean).join(', ')
}
