# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- SpacetimeDB skills live in `.claude/skills/`. Start from `spacetimedb` (the router) and load `spacetimedb-tables`, `spacetimedb-reducers` or `spacetimedb-client-typescript` before writing module or client code. Prefer the skills and the installed `spacetimedb` package typings over remembered APIs; the SDK is 2.x.
- UI components: use the shadcn CLI from `apps/console`. ReUI is available as the `@reui` registry namespace, for example `pnpm dlx shadcn@latest add @reui/badge`. Search it with `pnpm dlx shadcn@latest search @reui`.
- The commit and PR rules in AGENTS.md override Claude Code's default attribution guidance: no `Co-Authored-By` lines and no "Generated with Claude Code" lines.
