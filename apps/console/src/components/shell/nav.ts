export type ViewId = 'agent' | 'alerts' | 'log' | 'operators'

export const VIEW_TITLES: Record<ViewId, string> = {
  agent: 'Agent',
  alerts: 'Alerts',
  log: 'Log',
  operators: 'Operators',
}
