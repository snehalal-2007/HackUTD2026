import { useEffect, useState, type ReactNode } from 'react'
import { DropdownMenu } from 'radix-ui'
import { PageActionsContext } from './page-actions-context'
import {
  BotIcon,
  InboxIcon,
  LayoutGridIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  SirenIcon,
  UsersIcon,
  ArrowLeftRightIcon,
  LogOutIcon,
  CheckIcon,
  ChevronsUpDownIcon,
} from 'lucide-react'
import { endSession, HOME_ROUTE, startSession } from '@/auth/components/session'
import { demoAccounts, leaveDemoAccount, switchToDemo } from '@/auth/components/demo-accounts'
import { navigateTo } from '@/lib/route'
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
import { BrandMark } from './brand-mark'
import { CharacterAvatar } from './character-avatar'
import { ShiftClock } from './shift-clock'
import { ThemeToggle } from './theme-toggle'
import { IntrusionBanner } from '@/components/security/intrusion-banner'
import { useSecurity } from '@/components/security/use-security'
import { VIEW_TITLES, type ViewId } from './nav'

interface Item {
  id: string
  label: string
  icon: ReactNode
  view?: ViewId
}

// Icons are static JSX so the shadcn CLI can rewrite them if the icon library changes.
const WORK: Item[] = [
  { id: 'queue', label: 'My Queue', view: 'queue', icon: <InboxIcon aria-hidden="true" /> },
  { id: 'floor', label: 'Floor', view: 'floor', icon: <LayoutGridIcon aria-hidden="true" /> },
  { id: 'alerts', label: 'Alerts', view: 'alerts', icon: <SirenIcon aria-hidden="true" /> },
  { id: 'agent', label: 'AI Agent', view: 'agent', icon: <BotIcon aria-hidden="true" /> },
  { id: 'handoff', label: 'Shift Handoff', icon: <ArrowLeftRightIcon aria-hidden="true" /> },
]

const SYSTEM: Item[] = [
  { id: 'events', label: 'Log', view: 'log', icon: <ScrollTextIcon aria-hidden="true" /> },
  { id: 'security', label: 'Security', view: 'security', icon: <ShieldAlertIcon aria-hidden="true" /> },
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
                className="h-9 text-[14.5px] data-active:font-semibold" // prototype nav: larger text, current page as a white card
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
              {item.id === 'security' && <SecurityCount />}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/** Ends the demo sign-in session and returns to the home page. */
function SignOutButton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="Sign out"
          onClick={() => {
            endSession()
            navigateTo(HOME_ROUTE)
          }}
        >
          <LogOutIcon aria-hidden="true" />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** Red count of decoy calls next to the Security nav item; nothing while the honeypot is quiet. */
function SecurityCount() {
  const { events } = useSecurity()
  if (!events.length) return null
  return <SidebarMenuBadge className="rounded-full bg-destructive text-white peer-hover/menu-button:text-white peer-data-active/menu-button:text-white">{events.length}</SidebarMenuBadge>
}

/** Connection status + theme toggle + shift clock: the prototype keeps these at the bottom of the nav. */
function StatusRow() {
  const conn = useSpacetimeDB()
  const state = conn.isActive ? 'Live' : conn.connectionError ? 'Offline' : 'Connecting'
  return (
    <div className="flex flex-col gap-2 px-2 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] ${conn.isActive ? 'border-success text-foreground' : conn.connectionError ? 'border-destructive text-destructive' : 'border-warning text-foreground'}`}
          role="status"
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${conn.isActive ? 'animate-pulse bg-success' : conn.connectionError ? 'bg-destructive' : 'bg-warning'}`} />
          {state}
        </span>
        <ThemeToggle />
      </div>
      <ShiftClock />
    </div>
  )
}

function AccountButton({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const conn = useSpacetimeDB()
  const [operators] = useTable(tables.operator)
  const me = conn.identity ? operators.find(o => o.identity.isEqual(conn.identity!)) : undefined
  const name = me?.name ?? 'Not registered'
  const initials = me ? me.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'
  const status = conn.isActive ? 'Connected' : conn.connectionError ? 'Connection failed' : 'Connecting'

  const [demo, setDemo] = useState<{ names: string[]; current: string | null }>({ names: [], current: null })
  useEffect(() => { void demoAccounts().then(setDemo) }, []) // only a machine that ran pnpm demo:accounts has any
  const title = (k: string) => k[0].toUpperCase() + k.slice(1)
  const become = async (key: string | null) => { // reconnect as another operator, staying on this page
    if (key === demo.current) return
    const ok = key ? await switchToDemo(key) : await leaveDemoAccount()
    if (!ok) return
    if (key) startSession(title(key))
    window.location.reload()
  }

  const button = (
    <SidebarMenuButton size="lg" tooltip={`${name}, ${status}`} onClick={demo.names.length ? undefined : () => onNavigate('operators')}>
      {me ? (
        <CharacterAvatar identity={me.identity.toHexString()} size={32} className="size-8!" /* the sidebar shrinks icons to 16px; keep the character full size */ />
      ) : (
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      )}
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
      {demo.names.length > 0 && <ChevronsUpDownIcon className="ml-auto size-4 text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden" aria-hidden="true" />}
    </SidebarMenuButton>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {!demo.names.length ? button : ( // no demo accounts here: the button just opens Operators, as before
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>{button}</DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content side="top" align="start" sideOffset={6} className="z-50 min-w-[220px] rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-border">
                <DropdownMenu.Label className="px-2 py-1 text-[12px] text-muted-foreground">Switch operator (demo)</DropdownMenu.Label>
                {demo.names.map(k => (
                  <DropdownMenu.Item key={k} onSelect={() => void become(k)} className={SWITCH_ITEM}>
                    {title(k)}
                    {demo.current === k && <CheckIcon className="ml-auto size-4" aria-hidden="true" />}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Item onSelect={() => void become(null)} className={SWITCH_ITEM}>
                  This browser's own account
                  {demo.current === null && <CheckIcon className="ml-auto size-4" aria-hidden="true" />}
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item onSelect={() => onNavigate('operators')} className={SWITCH_ITEM}>
                  <UsersIcon className="size-4 text-muted-foreground" aria-hidden="true" /> Operators page
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

const SWITCH_ITEM = 'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13.5px] outline-none data-[highlighted]:bg-accent' // one row of the operator switcher

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
  const { isMobile, setOpenMobile } = useSidebar()
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null) // the header's right-hand slot (PageActions)
  // On phones the sidebar is a drawer; close it once a view is picked.
  const onNavigate = (v: ViewId) => {
    navigate(v)
    if (isMobile) setOpenMobile(false)
  }
  return (
    <>
      <Sidebar collapsible="icon" className="absolute h-full group-data-[side=left]:border-r-0" /* no divider: the nav sits on the page background */>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" className="cursor-default group-data-[collapsible=icon]:h-12! hover:bg-transparent active:bg-transparent" /* just the logo, not a link; same height collapsed so the mark doesn't jump up */>
                <div>
                <BrandMark />
                <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:sr-only">
                  <span className="truncate font-brand leading-none">
                    <span className="text-[25px]" /* capital M at 25px stands level with lowercase "esa" at 30px */>M</span>
                    <span className="text-[30px]">esa</span>
                  </span>
                </span>
              </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent role="navigation" aria-label="Primary">
          <NavGroup label="Operations" items={WORK} view={view} onNavigate={onNavigate} />
          <NavGroup label="System" items={SYSTEM} view={view} onNavigate={onNavigate} />
        </SidebarContent>

        <SidebarFooter>
          <StatusRow />
          <SignOutButton />
          <AccountButton onNavigate={onNavigate} /> {/* account at the very bottom, sign out just above it */}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        {view === 'floor' ? (
          <h1 className="sr-only">{VIEW_TITLES[view]}</h1> // the Floor page is full-bleed like the prototype; its tile carries the mobile menu button
        ) : (
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <h1 className="truncate text-sm font-medium">{title ?? VIEW_TITLES[view]}</h1>
            <div ref={setActionsEl} className="ml-auto flex min-w-0 items-center gap-2" /> {/* views put controls here through <PageActions> */}
          </header>
        )}
        {view !== 'security' && <IntrusionBanner onOpen={() => onNavigate('security')} />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col"><PageActionsContext.Provider value={actionsEl}>{children}</PageActionsContext.Provider></div>
      </SidebarInset>
    </>
  )
}
