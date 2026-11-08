// Shared Claude client: one budget for reports and chat, so a burst of incidents or questions can't run up cost.
import Anthropic from '@anthropic-ai/sdk'
import { config, llmEnabled } from './config.js'

export const client = llmEnabled ? new Anthropic({ apiKey: config.apiKey }) : null

// Server-side refusal fallback: if the model declines on policy grounds, the API retries on a fallback model in the same call.
export const FALLBACK = { betas: ['server-side-fallback-2026-07-01'] as Anthropic.Beta.AnthropicBeta[], fallbacks: 'default' as const }

let calls = 0
setInterval(() => (calls = 0), 60_000).unref()
/** Takes one call from the per-minute budget; false when it's spent. */
export const takeBudget = () => (calls < config.maxLlmCallsPerMin ? (calls++, true) : false)

export function describeError(err: unknown) {
  if (err instanceof Anthropic.RateLimitError) return 'Claude is rate-limited right now'
  if (err instanceof Anthropic.AuthenticationError) return 'the Anthropic API key was rejected'
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'Claude took too long to respond'
  if (err instanceof Anthropic.APIConnectionError) return 'the agent could not reach Claude'
  if (err instanceof Anthropic.APIError) return `Claude returned an error (${err.status ?? 'unknown'})`
  return 'an unexpected error'
}
