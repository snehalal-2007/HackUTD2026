export type ViewId = 'queue' | 'floor' | 'cluster' | 'agent' | 'alerts' | 'log' | 'operators' | 'security' | 'handoff'

export const VIEW_TITLES: Record<ViewId, string> = {
  queue: 'My Queue',
  floor: 'Floor',
  cluster: 'Cluster',
  agent: 'AI Agent',
  alerts: 'Alerts',
  log: 'Log',
  operators: 'Operators',
  security: 'Security',
  handoff: 'Shift Handoff',
}
