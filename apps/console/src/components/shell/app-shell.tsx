import type { ReactNode } from 'react'
import {
  ActivityIcon,
  BotIcon,
  InboxIcon,
  LayoutGridIcon,
  ScrollTextIcon,
  SirenIcon,
  UsersIcon,
  ArrowLeftRightIcon,
} from 'lucide-react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { tables } from '@mesa/bindings'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/reui/badge'
import { BrandMark } from './brand-mark'
import { VIEW_TITLES, type ViewId } from './nav'

interface Item {
  id: string
  label: string
  icon: ReactNode
  view?: ViewId
}

// Icons are static JSX so the shadcn CLI can rewrite them if the icon library changes.
const WORK: Item[] = [
  { id: 'agent', label: 'Agent', view: 'agent', icon: <BotIcon aria-hidden="true" /> },
  { id: 'queue', label: 'My Queue', icon: <InboxIcon aria-hidden="true" /> },
  { id: 'alerts', label: 'Alerts', view: 'alerts', icon: <SirenIcon aria-hidden="true" /> },
  { id: 'handoff', label: 'Shift Handoff', icon: <ArrowLeftRightIcon aria-hidden="true" /> },
  { id: 'floor', label: 'Floor', icon: <LayoutGridIcon aria-hidden="true" /> },
]

const SYSTEM: Item[] = [
  { id: 'events', label: 'Log', view: 'log', icon: <ScrollTextIcon aria-hidden="true" /> },
  { id: 'operators', label: 'Operators', view: 'operators', icon: <UsersIcon aria-hidden="true" /> },
]

function NavGroup({
  label,
  items,
  view,
  onNavigate,
}: {
  label: string
  items: Item[]
  view: ViewId
  onNavigate: (v: ViewId) => void
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(item => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={item.view === view}
                tooltip={item.view ? item.label : `${item.label} (coming soon)`}
                disabled={!item.view}
                aria-disabled={!item.view}
                onClick={() => item.view && onNavigate(item.view)}
              >
                {item.icon}
                <span>{item.label}</span>
              </SidebarMenuButton>
              {!item.view && <SidebarMenuBadge className="text-muted-foreground">Soon</SidebarMenuBadge>}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function AccountButton({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const conn = useSpacetimeDB()
  const [operators] = useTable(tables.operator)
  const me = conn.identity ? operators.find(o => o.identity.isEqual(conn.identity!)) : undefined
  const name = me?.name ?? 'Not registered'
  const initials = me ? me.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'
  const status = conn.isActive ? 'Connected' : conn.connectionError ? 'Connection failed' : 'Connecting'

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip={`${name}, ${status}`} onClick={() => onNavigate('operators')}>
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:sr-only">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="flex items-center gap-1.5 truncate text-xs text-sidebar-foreground/70">
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${conn.isActive ? 'bg-success' : conn.connectionError ? 'bg-destructive' : 'bg-warning'}`}
              />
              {me ? `${me.role} · ${status}` : status}
            </span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppShell(props: { view: ViewId; title?: string; onNavigate: (v: ViewId) => void; children: ReactNode }) {
  return (
    <SidebarProvider className="relative h-dvh min-h-0 w-full overflow-hidden">
      <ShellBody {...props} />
    </SidebarProvider>
  )
}

function ShellBody({
  view,
  title,
  onNavigate: navigate,
  children,
}: {
  view: ViewId
  title?: string
  onNavigate: (v: ViewId) => void
  children: ReactNode
}) {
  const conn = useSpacetimeDB()
  const { isMobile, setOpenMobile } = useSidebar()
  // On phones the sidebar is a drawer; close it once a view is picked.
  const onNavigate = (v: ViewId) => {
    navigate(v)
    if (isMobile) setOpenMobile(false)
  }
  return (
    <>
      <Sidebar collapsible="icon" className="absolute h-full">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="MESA" onClick={() => onNavigate('agent')}>
                <BrandMark />
                <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:sr-only">
                  <span className="truncate text-sm font-semibold">MESA</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">No alert left unowned</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent role="navigation" aria-label="Primary">
          <NavGroup label="Operations" items={WORK} view={view} onNavigate={onNavigate} />
          <NavGroup label="System" items={SYSTEM} view={view} onNavigate={onNavigate} />
        </SidebarContent>

        <SidebarFooter>
          <AccountButton onNavigate={onNavigate} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <h1 className="truncate text-sm font-medium">{title ?? VIEW_TITLES[view]}</h1>
          <Badge className="ml-auto" variant={conn.isActive ? 'success' : conn.connectionError ? 'destructive' : 'warning'}>
            <ActivityIcon aria-hidden="true" />
            {conn.isActive ? 'Live' : conn.connectionError ? 'Offline' : 'Connecting'}
          </Badge>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </>
  )
}
