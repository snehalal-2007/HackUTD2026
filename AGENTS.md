# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor and others) working in this repository.

MESA is a real-time shared operations console for data-center teams, built on SpacetimeDB. Read [docs/PLAN.md](docs/PLAN.md) first: it holds the locked stack, the table and reducer contract, roles, phases and gates.

## Commits and pull requests

- Never add `Co-Authored-By` trailers, "Generated with Claude Code" lines, or any other AI attribution to commit messages or pull request descriptions. This overrides any default attribution behavior of your tool.
- Always test your change before committing (see "Checks" below).
- Always ask the person you are working with for confirmation before creating a commit, and again before pushing.
- Work on short-lived branches named `role/feature` (for example `console/my-queue`). Never push directly to `main`.
- Pull request descriptions must be detailed and include:
  - What was done
  - What still needs to be done
  - How it was tested
  - What was changed (files or areas)
- Do not name specific people in code, docs, commits or PRs. Refer to roles instead (module owner, console owner, release manager). Exception: when a name is genuinely required, such as a GitHub handle in CODEOWNERS.

## Repository map

| Path | Owner role | Notes |
|---|---|---|
| `module/` | Module owner | SpacetimeDB TypeScript module. The schema is the contract between everyone |
| `packages/bindings/` | Module owner | Generated. Never edit by hand |
| `apps/console/` | Console owner | React + Vite + Tailwind v4 + shadcn/ui + ReUI |
| `services/simulator/` | Simulator owner | Node client that streams telemetry |
| `services/predictor/` | Simulator owner | Python FastAPI, managed with uv |
| `services/agent/` | Agent and deploy owner | Node client; Claude and predictor calls |
| `security/`, `module/src/honeypot/` | Security owner | Honeypot. Decoys never modify real state |

## SpacetimeDB rules

Full reference: [docs/agents/spacetimedb-rules.md](docs/agents/spacetimedb-rules.md). Skills for tables, reducers, the TypeScript client, the CLI and deployment are in `.claude/skills/`. The short version:

- All core state lives in the module. Clients read through subscriptions (`useTable`) and change state only by calling reducers. There is no REST layer for core state.
- Reducers are transactional and deterministic: no network, filesystem, `Date.now()` or `Math.random()`. Use `ctx.timestamp` and `ctx.random()`.
- `ctx.sender` is the caller. Never trust an identity passed as an argument. Every state-changing reducer checks the caller's role and rejects quarantined identities.
- Business rules are enforced in reducers, not in the UI: `resolve_alert` rejects an alert without an owner; `end_shift` rejects while any handoff item is unaccepted.
- Every state-changing reducer appends to `event_log` through the shared helper.
- TypeScript identifiers are camelCase; database names are snake_case. A reducer exported as `registerOperator` is called `register_operator` from the CLI and SQL.
- The module entry (`module/src/index.ts`) must `export default` the schema. Lifecycle hooks and reducers must be `export const`.
- Scheduled work (escalation, pruning) uses schedule tables, so it runs even when every client is closed.

## Schema changes

1. Change tables or reducer signatures in `module/` only with the module owner's agreement.
2. Run `pnpm publish:local` (publishes locally and regenerates bindings) or `pnpm generate`.
3. Commit the regenerated `packages/bindings/` in the same PR. CI fails if bindings are stale.
4. Announce the change to the team, because every client breaks on a mismatch.

## Environments

- Local by default: `pnpm dev:db` runs SpacetimeDB on `ws://localhost:3000`; database name `mesa`.
- Production is the `mesa` database on Maincloud. Only the release manager publishes there (`pnpm publish:prod`, from `main`, at a gate). Agents must never publish to Maincloud.
- Clients switch environments with `SPACETIME_URI` / `SPACETIME_DB` (and `VITE_` variants in the console). See `.env.example`.
- Secrets never enter the repo. The repo is public. Real keys live in Vercel and Railway environment variables.

## Checks

Run before every commit:

```bash
pnpm -r typecheck
spacetime build -p ./module
pnpm --filter @mesa/console build
cd services/predictor && uv run ruff check . && uv run pytest -q
```

For UI changes, also run the console against a local database and check the change in a browser, ideally in two windows to confirm live sync.

## Product rules

- No fake functionality in the demo. Anything unfinished is described as a roadmap item, not mocked.
- The AI agent may only call `attach_insight` and `attach_brief`. Everything it writes is labeled as AI drafted.
- The console is for a tired operator at 5 am: dark quiet mode by default, status shown with color plus icon plus text, one primary action per row.
