import { t, SenderError } from 'spacetimedb/server';
import spacetimedb from '../schema';
import { isAgent, rejectAgent } from '../lib/agent';
import { appendEvent } from '../lib/log';
import { assertAllowed } from '../honeypot/guard';

const MAX_QUESTION = 1_000;
const MAX_STEP_DETAIL = 4_000;
const MAX_ANSWER = 8_000;
const MAX_PENDING_PER_OPERATOR = 3;
const STEP_KINDS = new Set(['thinking', 'lookup', 'result', 'error']);
const OUTCOMES = new Set(['answered', 'failed']);
const SOURCES = new Set(['claude', 'unavailable']);

/** An operator asks the agent a question. The agent service picks up pending rows and answers them. */
export const askAgent = spacetimedb.reducer({ question: t.string() }, (ctx, { question }) => {
  assertAllowed(ctx); // honeypot: quarantined identities are rejected
  rejectAgent(ctx); // the agent never asks itself
  const text = question.trim();
  if (!text) throw new SenderError('question is required');
  if (text.length > MAX_QUESTION) throw new SenderError(`question is longer than ${MAX_QUESTION} characters`);

  let pending = 0;
  for (const row of ctx.db.agentChat.iter()) {
    if (row.askedBy.isEqual(ctx.sender) && (row.status === 'pending' || row.status === 'thinking')) pending++;
  }
  if (pending >= MAX_PENDING_PER_OPERATOR) throw new SenderError('wait for the agent to answer your earlier questions');

  const op = ctx.db.operator.identity.find(ctx.sender);
  ctx.db.agentChat.insert({
    chatId: 0n,
    askedBy: ctx.sender,
    askerName: op?.name ?? 'Operator',
    question: text,
    status: 'pending',
    answer: '',
    model: '',
    source: '',
    askedAt: ctx.timestamp,
    answeredAt: ctx.timestamp,
    durationMs: 0,
  });
  appendEvent(ctx, op?.name ?? 'operator', 'asked the agent', text.slice(0, 80), null);
});

/**
 * The agent records one working step (reasoning summary, data lookup or result) while it answers.
 * Steps are working notes for the thought-process panel; the answer itself is what goes in the event log.
 */
export const addAgentStep = spacetimedb.reducer(
  { chatId: t.u64(), kind: t.string(), title: t.string(), detail: t.string() },
  (ctx, { chatId, kind, title, detail }) => {
    if (!isAgent(ctx)) throw new SenderError('forbidden');
    if (!STEP_KINDS.has(kind)) throw new SenderError('bad step kind');
    const chat = ctx.db.agentChat.chatId.find(chatId);
    if (!chat) throw new SenderError('no such question');
    if (chat.status === 'answered' || chat.status === 'failed') return; // late step after the answer: ignore
    ctx.db.agentStep.insert({ stepId: 0n, chatId, kind, title: title.slice(0, 200), detail: detail.slice(0, MAX_STEP_DETAIL), at: ctx.timestamp });
    if (chat.status === 'pending') ctx.db.agentChat.chatId.update({ ...chat, status: 'thinking' });
  }
);

/** The agent posts its answer (or says it could not answer). Idempotent: a second answer is ignored. */
export const answerAgent = spacetimedb.reducer(
  { chatId: t.u64(), outcome: t.string(), answer: t.string(), model: t.string(), source: t.string(), durationMs: t.u32() },
  (ctx, { chatId, outcome, answer, model, source, durationMs }) => {
    if (!isAgent(ctx)) throw new SenderError('forbidden');
    if (!OUTCOMES.has(outcome)) throw new SenderError('bad outcome');
    if (!SOURCES.has(source)) throw new SenderError('bad source');
    const chat = ctx.db.agentChat.chatId.find(chatId);
    if (!chat) throw new SenderError('no such question');
    if (chat.status === 'answered' || chat.status === 'failed') return;
    ctx.db.agentChat.chatId.update({
      ...chat,
      status: outcome,
      answer: answer.trim().slice(0, MAX_ANSWER),
      model: model.slice(0, 60),
      source,
      answeredAt: ctx.timestamp,
      durationMs,
    });
    appendEvent(ctx, 'agent', outcome === 'answered' ? 'answered a question' : 'could not answer a question', `question ${chatId}`, null);
  }
);
