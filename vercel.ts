import { routes, type VercelConfig } from '@vercel/config/v1'

// Vercel deploys only the operator console. The SpacetimeDB module is published
// separately with the spacetime CLI (scripts/publish.sh), which Vercel does not have.
export const config: VercelConfig = {
  framework: 'vite',
  installCommand: 'pnpm install --frozen-lockfile',
  buildCommand: 'pnpm --filter @mesa/console build',
  outputDirectory: 'apps/console/dist',
  // Single-page app: unknown paths fall back to the console. Real files are served first.
  rewrites: [routes.rewrite('/(.*)', '/index.html')],
}
