export type ViewId = 'queue' | 'floor' | 'agent' | 'alerts' | 'log' | 'operators' | 'security'

export const VIEW_TITLES: Record<ViewId, string> = {
  queue: 'My Queue',
  floor: 'Floor',
  agent: 'AI Agent',
  alerts: 'Alerts',
  log: 'Log',
  operators: 'Operators',
  security: 'Security',
}
