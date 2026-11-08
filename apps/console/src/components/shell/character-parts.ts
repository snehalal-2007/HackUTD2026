// Profile characters: original, simple illustrated people built from parts (background, skin, hair, eyes, mouth,
// shirt, and an occasional data-center accessory). Each operator gets one picked from their identity, so it's the
// same every time they sign in. docs/profile-characters.html shows the whole set; keep the two generators in sync.

export const CHARACTER_COUNT = 48

const BG = ['#f3d7c6', '#d9e7dd', '#dbe4f3', '#efe0b8', '#e9d8ef', '#f6d4d4', '#d5ece9', '#e8e3d9']
const SKIN = ['#f6d5bd', '#eab894', '#cf9469', '#a86f48', '#7d4f33', '#5a3825']
const HAIR = ['#2b2118', '#5a3a22', '#9a5530', '#d6a24a', '#1f1f22', '#a3a7ad', '#c8553d', '#3d2c4f']
const SHIRT = ['#18181b', '#2f9e6b', '#4a7fe0', '#d48806', '#7c5cf0', '#e5484d', '#5b5b63', '#0f766e']
const HAIRSTYLE = ['short', 'bob', 'bun', 'curly', 'long', 'buzz', 'side', 'puffs'] as const
const EYES = ['dots', 'happy', 'glasses', 'dots', 'wink'] as const
const MOUTH = ['smile', 'grin', 'smile', 'o', 'flat'] as const
const EXTRA = ['none', 'none', 'headset', 'hardhat', 'beanie', 'none', 'cap', 'earrings', 'none', 'freckles'] as const

export interface CharacterSpec {
  bg: string
  skin: string
  hair: string
  shirt: string
  hairstyle: (typeof HAIRSTYLE)[number]
  eyes: (typeof EYES)[number]
  mouth: (typeof MOUTH)[number]
  extra: (typeof EXTRA)[number]
}

/** Small deterministic PRNG (mulberry32), so character n always looks the same. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]

export function characterSpec(n: number): CharacterSpec {
  const r = rng(n * 7919 + 17)
  return {
    bg: BG[n % BG.length],
    skin: pick(r, SKIN),
    hair: pick(r, HAIR),
    shirt: pick(r, SHIRT),
    hairstyle: HAIRSTYLE[(n * 5) % HAIRSTYLE.length],
    eyes: pick(r, EYES),
    mouth: pick(r, MOUTH),
    extra: pick(r, EXTRA),
  }
}

/** An operator's character number, from their identity (hex). */
export function characterFor(identityHex: string): number {
  let h = 2166136261
  for (let i = 0; i < identityHex.length; i++) h = Math.imul(h ^ identityHex.charCodeAt(i), 16777619)
  return (h >>> 0) % CHARACTER_COUNT
}
