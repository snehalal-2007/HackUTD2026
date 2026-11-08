import { table, t } from 'spacetimedb/server';

// Operator ↔ agent chat. An operator asks through ask_agent; the agent service answers through
// add_agent_step (its working steps, shown live in the console's thought-process panel) and answer_agent.

/** One question and its answer. */
export const agentChat = table(
  { name: 'agent_chat', public: true },
  {
    chatId: t.u64().primaryKey().autoInc(),
    askedBy: t.identity(),
    askerName: t.string(),
    question: t.string(),
    status: t.string(), // pending | thinking | answered | failed
    answer: t.string(),
    model: t.string(), // e.g. claude-sonnet-5-5; empty until answered
    source: t.string(), // claude | unavailable; empty until answered
    askedAt: t.timestamp(),
    answeredAt: t.timestamp(), // equals askedAt until answered
    durationMs: t.u32(),
  }
);

/** The agent's working steps for one question, in order: reasoning summaries, data lookups and their results. */
export const agentStep = table(
  {
    name: 'agent_step',
    public: true,
    indexes: [{ accessor: 'by_chat', algorithm: 'btree', columns: ['chatId'] }],
  },
  {
    stepId: t.u64().primaryKey().autoInc(),
    chatId: t.u64(),
    kind: t.string(), // thinking | lookup | result | error
    title: t.string(),
    detail: t.string(),
    at: t.timestamp(),
  }
);
