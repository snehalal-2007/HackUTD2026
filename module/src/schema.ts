import { quarantine, threatEvent } from './honeypot/tables';
import { schema, table, t } from 'spacetimedb/server';

// Phase 0 placeholder. The full contract (docs/PLAN.md, section 4) lands in Phase 1.
// Tables live in ./tables/ once the contract is frozen; keep this file as the single schema() call.

export const operator = table(
  { name: 'operator', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    role: t.string(), // operator | lead | observer | agent
    onShift: t.bool(),
    online: t.bool(),
  }
);

const spacetimedb = schema({ operator, quarantine, threatEvent });
export default spacetimedb;
