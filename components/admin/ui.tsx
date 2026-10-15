import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export const inputClass = 'mt-1.5 h-10 w-full rounded-lg border border-[#d8e1ec] bg-white px-3 text-sm font-normal text-[#14233b] outline-none transition focus:border-[#1d5fa7] focus:ring-2 focus:ring-[#1d5fa7]/15'
export const textareaClass = 'mt-1.5 w-full rounded-lg border border-[#d8e1ec] bg-white px-3 py-2 text-sm font-normal text-[#14233b] outline-none transition focus:border-[#1d5fa7] focus:ring-2 focus:ring-[#1d5fa7]/15'
export const labelClass = 'block text-xs font-semibold text-[#52637b]'
export const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#082957] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d3a78] disabled:opacity-60'
export const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[#d8e1ec] bg-white px-4 py-2.5 text-sm font-semibold text-[#14233b] transition hover:bg-[#f4f7fb] disabled:opacity-60'

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a87916]">{eyebrow}</p>}
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#14233b]">{title}</h1>
      {description && <p className="mt-1 text-sm text-[#718096]">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
}

export function StatCard({ label, value, note, tone = 'neutral', href }: { label: string; value: ReactNode; note?: string; tone?: 'neutral' | 'good' | 'warn' | 'bad'; href?: string }) {
  const body = <>
    <p className="text-xs font-semibold text-[#718096]">{label}</p>
    <p className="mt-2 text-3xl font-bold tracking-tight text-[#082957]">{value}</p>
    {note && <p className={cn('mt-1.5 text-xs font-medium', tone === 'good' ? 'text-[#267448]' : tone === 'warn' ? 'text-[#9a6d08]' : tone === 'bad' ? 'text-[#b32d3d]' : 'text-[#718096]')}>{note}</p>}
  </>
  const cls = 'block rounded-xl border border-[#dfe7f0] bg-white p-5 shadow-sm'
  return href ? <Link href={href} className={cn(cls, 'transition hover:border-[#b7c9df] hover:shadow-md')}>{body}</Link> : <div className={cls}>{body}</div>
}

export function Panel({ title, description, actions, children, className, flush }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return <section className={cn('rounded-xl border border-[#dfe7f0] bg-white shadow-sm', className)}>
    {(title || actions) && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-5 py-4">
      <div><h2 className="text-sm font-bold text-[#14233b]">{title}</h2>{description && <p className="mt-0.5 text-xs text-[#718096]">{description}</p>}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>}
    <div className={flush ? '' : 'p-5'}>{children}</div>
  </section>
}

const badgeTones: Record<string, string> = {
  Escalated: 'bg-[#fff0f1] text-[#b32d3d] ring-[#f6cdd2]',
  Resolved: 'bg-[#eaf8f0] text-[#267448] ring-[#c7e9d4]',
  Closed: 'bg-[#eaf8f0] text-[#267448] ring-[#c7e9d4]',
  New: 'bg-[#edf3fa] text-[#1d5fa7] ring-[#cfe0f2]',
  Received: 'bg-[#edf3fa] text-[#1d5fa7] ring-[#cfe0f2]',
  High: 'bg-[#fff0f1] text-[#b32d3d] ring-[#f6cdd2]',
  Low: 'bg-[#f3f6fa] text-[#52637b] ring-[#dfe7f0]',
  Active: 'bg-[#eaf8f0] text-[#267448] ring-[#c7e9d4]',
  Inactive: 'bg-[#f3f6fa] text-[#718096] ring-[#dfe7f0]',
  Overdue: 'bg-[#b32d3d] text-white ring-[#b32d3d]',
  Critical: 'bg-[#fff0f1] text-[#b32d3d] ring-[#f6cdd2]',
  Watch: 'bg-[#fff7df] text-[#9a6d08] ring-[#f2dfa6]',
  Healthy: 'bg-[#eaf8f0] text-[#267448] ring-[#c7e9d4]',
  Overloaded: 'bg-[#fff0f1] text-[#b32d3d] ring-[#f6cdd2]',
  Busy: 'bg-[#fff7df] text-[#9a6d08] ring-[#f2dfa6]',
  Available: 'bg-[#eaf8f0] text-[#267448] ring-[#c7e9d4]',
}

export function Badge({ children, tone }: { children: string; tone?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset', badgeTones[tone ?? children] ?? 'bg-[#fff7df] text-[#9a6d08] ring-[#f2dfa6]')}>{children}</span>
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
    <p className="text-sm font-bold text-[#14233b]">{title}</p>
    {text && <p className="mt-1 max-w-sm text-xs leading-5 text-[#718096]">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
}

export function FilterTabs({ items, active, param, basePath, params }: { items: { label: string; value: string; count?: number }[]; active: string; param: string; basePath: string; params: Record<string, string | undefined> }) {
  return <div className="flex gap-1 overflow-x-auto rounded-lg bg-[#edf1f5] p-1">
    {items.map((item) => {
      const next = new URLSearchParams(Object.entries({ ...params, [param]: item.value }).filter(([, v]) => v) as [string, string][])
      const isActive = active === item.value
      return <Link key={item.value || 'all'} href={`${basePath}${next.size ? `?${next}` : ''}`} className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition', isActive ? 'bg-white text-[#082957] shadow-sm' : 'text-[#607089] hover:text-[#14233b]')}>
        {item.label}{item.count !== undefined && <span className={cn('rounded px-1.5 text-[10px]', isActive ? 'bg-[#edf3fa]' : 'bg-white/70')}>{item.count}</span>}
      </Link>
    })}
  </div>
}

export function formatDate(value: Date | string | null | undefined, withTime = true) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

export function timeAgo(value: Date | string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export const initials = (name: string) => name.split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase()
