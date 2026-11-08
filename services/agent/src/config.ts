// Agent settings from the environment (repo-root .env locally, Railway variables in production).
// The API key is never logged.

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d)

export const config = {
  apiKey: process.env.ANTHROPIC_API_KEY?.trim() || '',
  model: process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  effort: (process.env.AGENT_EFFORT || 'high') as 'low' | 'medium' | 'high',
  uri: process.env.SPACETIME_URI || 'ws://localhost:3000',
  db: process.env.SPACETIME_DB || 'mesa',
  token: process.env.AGENT_TOKEN || undefined, // keeps the agent's identity stable; the module allow-lists it
  llmTimeoutMs: num(process.env.LLM_TIMEOUT_MS, 60_000),
  maxLlmCallsPerMin: num(process.env.MAX_LLM_CALLS_PER_MIN, 20),
}

/** Without a key the agent still writes template reports, and tells operators it can't answer questions. */
export const llmEnabled = config.apiKey.length > 0

export const describeConfig = () =>
  `model=${config.model} effort=${config.effort} llm=${llmEnabled ? 'on' : 'off (template reports only)'} db=${config.uri}/${config.db}`
