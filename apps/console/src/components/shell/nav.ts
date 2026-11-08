export type ViewId = 'floor' | 'cluster' | 'agent' | 'alerts' | 'log' | 'operators' | 'security' | 'handoff'

export const VIEW_TITLES: Record<ViewId, string> = {
  floor: 'Floor',
  cluster: 'Cluster',
  agent: 'AI Agent',
  alerts: 'Alerts',
  log: 'Log',
  operators: 'Operators',
  security: 'Security',
  handoff: 'Shift Handoff',
}
