export interface ReportAttachment {
  name: string
  kind: string // e.g. PDF, CSV
  size: string // display size, e.g. 1.9 MB
}

export interface ChatMessage {
  id: string
  role: 'operator' | 'agent'
  text: string
  time: string // display time, HH:MM
  attachments?: ReportAttachment[]
  stream?: boolean // reveal the text progressively
}
