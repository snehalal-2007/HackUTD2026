import { cn } from '@/lib/utils'
import { characterFor, characterSpec, type CharacterSpec } from './character-parts'

/** A profile character (see character-parts.ts). Pass an identity to get that person's character, or a number. */
export function CharacterAvatar({ identity, n, size = 32, className, title }: { identity?: string; n?: number; size?: number; className?: string; title?: string }) {
  const c: CharacterSpec = characterSpec(n ?? characterFor(identity ?? ''))
  const hat = c.extra === 'hardhat' || c.extra === 'beanie' || c.extra === 'cap' // a hat hides a bun or puffs
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn('shrink-0 rounded-full', className)} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <circle cx="32" cy="32" r="32" fill={c.bg} />
      {/* hair behind the head */}
      {(c.hairstyle === 'long' || c.hairstyle === 'bob') && (
        <path d={c.hairstyle === 'long' ? 'M17 30c0-11 7-18 15-18s15 7 15 18v18H17z' : 'M18 30c0-10 6-17 14-17s14 7 14 17v9H18z'} fill={c.hair} />
      )}
      {c.hairstyle === 'puffs' && !hat && (
        <>
          <circle cx="17" cy="20" r="6" fill={c.hair} />
          <circle cx="47" cy="20" r="6" fill={c.hair} />
        </>
      )}
      {/* shoulders and neck */}
      <path d="M9 64c2-11 11-17 23-17s21 6 23 17z" fill={c.shirt} />
      <rect x="28" y="39" width="8" height="9" rx="3" fill={c.skin} />
      {/* head */}
      <circle cx="19.5" cy="30" r="3" fill={c.skin} />
      <circle cx="44.5" cy="30" r="3" fill={c.skin} />
      <circle cx="32" cy="29" r="13" fill={c.skin} />
      {/* hair on top */}
      {c.hairstyle === 'short' && <path d="M19 28c0-9 6-15 13-15s13 6 13 15c-2-4-6-7-13-7s-11 3-13 7z" fill={c.hair} />}
      {c.hairstyle === 'buzz' && <path d="M19.5 26c1-8 6-12.5 12.5-12.5S43.5 18 44.5 26c-3-3-7-4.5-12.5-4.5S22.5 23 19.5 26z" fill={c.hair} opacity="0.75" />}
      {c.hairstyle === 'side' && <path d="M19 29c0-10 6-16 13-16s13 5 13 13c-5 0-10-2-13-6-2 4-7 8-13 9z" fill={c.hair} />}
      {(c.hairstyle === 'bob' || c.hairstyle === 'long') && <path d="M19 28c0-9 6-15 13-15s13 6 13 15c-4-1-9-4-12-8-3 4-9 7-14 8z" fill={c.hair} />}
      {c.hairstyle === 'bun' && (
        <>
          {!hat && <circle cx="32" cy="11" r="5.5" fill={c.hair} />}
          <path d="M19 28c0-9 6-15 13-15s13 6 13 15c-2-4-6-7-13-7s-11 3-13 7z" fill={c.hair} />
        </>
      )}
      {c.hairstyle === 'curly' && (
        <g fill={c.hair}>
          {[[21, 22], [25, 17], [31, 15], [37, 16], [42, 20], [44, 26], [20, 27]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="5" />)}
        </g>
      )}
      {c.hairstyle === 'puffs' && <path d="M19.5 27c1-8 6-13 12.5-13s11.5 5 12.5 13c-3-3-7-5-12.5-5s-9.5 2-12.5 5z" fill={c.hair} />}
      {/* face */}
      {c.extra === 'freckles' && <g fill="#a0522d" opacity="0.45">{[[25, 33], [27, 34.5], [37, 34.5], [39, 33]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.8" />)}</g>}
      <circle cx="24.5" cy="34" r="2.2" fill="#e5484d" opacity="0.18" />
      <circle cx="39.5" cy="34" r="2.2" fill="#e5484d" opacity="0.18" />
      {c.eyes === 'dots' && <g fill="#1f1f22"><circle cx="27" cy="29.5" r="1.7" /><circle cx="37" cy="29.5" r="1.7" /></g>}
      {c.eyes === 'happy' && <g fill="none" stroke="#1f1f22" strokeWidth="1.6" strokeLinecap="round"><path d="M25 30q2-2.4 4 0" /><path d="M35 30q2-2.4 4 0" /></g>}
      {c.eyes === 'wink' && <g stroke="#1f1f22" strokeWidth="1.6" strokeLinecap="round" fill="#1f1f22"><circle cx="27" cy="29.5" r="1.7" stroke="none" /><path d="M35 29.8h4" fill="none" /></g>}
      {c.eyes === 'glasses' && (
        <g>
          <g fill="#1f1f22"><circle cx="27" cy="29.5" r="1.5" /><circle cx="37" cy="29.5" r="1.5" /></g>
          <g fill="none" stroke="#1f1f22" strokeWidth="1.3"><circle cx="27" cy="29.5" r="4" /><circle cx="37" cy="29.5" r="4" /><path d="M31 29.5h2" /></g>
        </g>
      )}
      {c.mouth === 'smile' && <path d="M28 35.5q4 3.2 8 0" fill="none" stroke="#1f1f22" strokeWidth="1.6" strokeLinecap="round" />}
      {c.mouth === 'grin' && <path d="M27.5 35h9q-1 4.2-4.5 4.2T27.5 35z" fill="#1f1f22" />}
      {c.mouth === 'o' && <ellipse cx="32" cy="36.5" rx="1.8" ry="2.1" fill="#1f1f22" />}
      {c.mouth === 'flat' && <path d="M29 36.5h6" stroke="#1f1f22" strokeWidth="1.6" strokeLinecap="round" />}
      {/* accessories */}
      {c.extra === 'headset' && (
        <g fill="none" stroke="#27272a" strokeWidth="2.4" strokeLinecap="round">
          <path d="M18.5 30a13.5 13.5 0 0 1 27 0" />
          <rect x="16" y="27" width="5" height="8" rx="2" fill="#27272a" stroke="none" />
          <rect x="43" y="27" width="5" height="8" rx="2" fill="#27272a" stroke="none" />
          <path d="M18.5 34q0 6 8 6.5" strokeWidth="1.6" />
        </g>
      )}
      {c.extra === 'hardhat' && (
        <g>
          <path d="M19 23a13 11 0 0 1 26 0z" fill="#f2b705" />
          <rect x="16" y="22" width="32" height="3.2" rx="1.6" fill="#e0a800" />
          <rect x="30.5" y="12.5" width="3" height="10" rx="1.5" fill="#e0a800" />
        </g>
      )}
      {c.extra === 'beanie' && (
        <g>
          <path d="M19 24a13 12 0 0 1 26 0z" fill={c.shirt} />
          <rect x="18" y="21.5" width="28" height="4.5" rx="2.2" fill={c.shirt} opacity="0.85" />
          <circle cx="32" cy="11.5" r="2.6" fill={c.shirt} />
        </g>
      )}
      {c.extra === 'cap' && (
        <g fill={c.shirt}>
          <path d="M19.5 24a12.5 11 0 0 1 25 0z" />
          <path d="M32 22.5h16q0 2.8-3 2.8H32z" />
        </g>
      )}
      {c.extra === 'earrings' && <g fill="#d6a24a"><circle cx="19.5" cy="34" r="1.3" /><circle cx="44.5" cy="34" r="1.3" /></g>}
    </svg>
  )
}
