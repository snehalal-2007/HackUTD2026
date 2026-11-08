// SAMPLE TESTIMONIALS. Every person and company here is made up. The panel labels them as samples;
// replace this list with real, approved customer quotes before showing it to anyone as an endorsement.

export interface Testimonial {
  quote: string
  name: string
  role: string
  company: string
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'MESA put our physical floor and our virtual estate on one screen. When a CRAC unit trips, we see which racks and which workloads are at risk in the same minute.',
    name: 'Priya Venkataraman',
    role: 'Director of Data Center Operations',
    company: 'Cobalt Ridge Data',
  },
  {
    quote: 'Shift handoff used to be a sticky note and a prayer. Now nothing changes hands until the incoming lead accepts it, and that alone cut our missed escalations to zero.',
    name: 'Marcus Oyelaran',
    role: 'Night Shift Lead',
    company: 'Larkspur Compute',
  },
  {
    quote: 'We run three halls and a few hundred virtual clusters. MESA is the first tool where an alert on a PDU and an alert on a VM host end up with the same owner and the same deadline.',
    name: 'Elena Castellanos',
    role: 'VP, Infrastructure',
    company: 'Meridian Vault Co.',
  },
  {
    quote: 'The time-to-breach countdown changed how we triage. We stopped chasing the loudest alarm and started fixing the one that would actually hurt first.',
    name: 'Daniel Whitcombe',
    role: 'Site Reliability Manager',
    company: 'Tallgrass Cloud',
  },
  {
    quote: 'Our auditors asked who owned every incident last quarter. MESA answered in one export, physical and virtual, down to the minute it was accepted.',
    name: 'Aiko Nakamura-Reyes',
    role: 'Head of Compliance Engineering',
    company: 'Brightwater Hosting',
  },
  {
    quote: 'Everyone sees the same live state, from the floor tech to the boardroom. Fewer calls asking “is anyone on this?”, and more time fixing things.',
    name: 'Tomasz Brennan',
    role: 'Chief Technology Officer',
    company: 'Ironleaf Systems',
  },
]

/** A fresh order on every visit, so the first quote isn't always the same. */
export function shuffled<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
