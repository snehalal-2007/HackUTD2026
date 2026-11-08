import { BotIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageAvatar, MessageContent, MessageFooter } from '@/components/ui/message'
import { Spinner } from '@/components/ui/spinner'
import { ReportAttachment } from './report-attachment'
import type { ChatMessage } from './types'
import { useStream } from './use-stream'

export function OperatorMessage({ message, className }: { message: ChatMessage; className?: string }) {
  return (
    <Message align="end" className={className}>
      <MessageContent>
        <Bubble variant="muted">
          <BubbleContent className="whitespace-pre-wrap">{message.text}</BubbleContent>
        </Bubble>
        <MessageFooter>
          <span className="tabular-nums">{message.time}</span>
        </MessageFooter>
      </MessageContent>
    </Message>
  )
}

// One live region per reply announces the two states worth interrupting for,
// instead of every streamed chunk. The bubble and footer stay mounted throughout.
export function AgentMessage({ message, pendingLabel, className }: { message: ChatMessage; pendingLabel?: string; className?: string }) {
  const { revealed, done, replay } = useStream(message.text, !!message.stream)

  return (
    <Message className={className}>
      <MessageAvatar>
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary text-primary-foreground">
            <BotIcon className="size-4" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <span role="status" className="sr-only">
          {done ? 'Reply ready' : revealed === 0 ? 'Agent is working' : ''}
        </span>
        <Bubble variant="ghost" aria-busy={!done}>
          <BubbleContent>
            {revealed === 0 ? (
              <Marker>
                <MarkerIcon>
                  <Spinner />
                </MarkerIcon>
                <MarkerContent>
                  <span className="animate-pulse motion-reduce:animate-none">{pendingLabel ?? 'Thinking...'}</span>
                </MarkerContent>
              </Marker>
            ) : (
              <p className="whitespace-pre-wrap">
                {message.text.slice(0, revealed)}
                {done ? null : (
                  <span
                    aria-hidden="true"
                    className="ms-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 bg-foreground"
                  />
                )}
              </p>
            )}
          </BubbleContent>
        </Bubble>
        {done && message.attachments?.map(a => <ReportAttachment key={a.name} report={a} />)}
        <MessageFooter className="gap-2">
          <span className="tabular-nums">{message.time}</span>
          {message.stream && (
            <Button type="button" variant="ghost" size="xs" onClick={replay}>
              Replay
            </Button>
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  )
}
