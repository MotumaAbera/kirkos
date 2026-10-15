'use client'

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'
import type { ActionState } from '@/app/admin/actions'
import { cn } from '@/lib/utils'
import { primaryButton } from '@/components/admin/ui'

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>

const PendingContext = createContext(false)

/** A form bound to a server action that shows the action's error or success message inline. */
export function ActionForm({ action, children, className, resetOnSuccess, clearOnSuccess, hideMessage, id }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; clearOnSuccess?: string[]; hideMessage?: boolean; id?: string }) {
  const [state, formAction, pending] = useActionState(action, null)
  const ref = useRef<HTMLFormElement>(null)
  const clearKey = clearOnSuccess?.join()
  useEffect(() => {
    const form = ref.current
    if (!state?.ok || !form) return
    if (resetOnSuccess) form.reset()
    for (const name of clearKey?.split(',') ?? []) {
      const field = form.elements.namedItem(name)
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.value = ''
    }
    const dialog = form.closest('dialog')
    if (dialog) {
      dialog.close()
      // The dialog's inline message disappears with it, so surface the result as a toast instead.
      if (state.message) window.dispatchEvent(new CustomEvent('admin-toast', { detail: state.message }))
    }
  }, [state, resetOnSuccess, clearKey])
  // Dispatch manually so React doesn't auto-reset the form: entered values survive a validation error.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter
    const fd = new FormData(e.currentTarget, submitter)
    startTransition(() => formAction(fd))
  }
  return <form id={id} ref={ref} action={formAction} onSubmit={onSubmit} className={className}>
    <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    {!hideMessage && state?.error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-[#fff0f1] px-3 py-2 text-xs font-semibold text-[#b32d3d]"><CircleAlert className="mt-px size-3.5 shrink-0" />{state.error}</p>}
    {!hideMessage && state?.ok && state.message && <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-[#eaf8f0] px-3 py-2 text-xs font-semibold text-[#267448]"><CheckCircle2 className="size-3.5" />{state.message}</p>}
  </form>
}

export function SubmitButton({ children, className, pendingText = 'Saving…', confirm }: { children: ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const contextPending = useContext(PendingContext)
  const { pending: nativePending } = useFormStatus()
  const pending = contextPending || nativePending
  return <button type="submit" disabled={pending} className={className ?? primaryButton} onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault() } : undefined}>{pending ? pendingText : children}</button>
}

/** Header checkbox that toggles every `ids` checkbox in the same form, and shows how many are selected. */
export function SelectAll({ label = 'Select all' }: { label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const form = ref.current?.form
    if (!form) return
    const sync = () => {
      const boxes = [...form.querySelectorAll<HTMLInputElement>('input[name=ids]')]
      const checked = boxes.filter((b) => b.checked).length
      if (ref.current) { ref.current.checked = checked > 0 && checked === boxes.length; ref.current.indeterminate = checked > 0 && checked < boxes.length }
      form.querySelectorAll('[data-selected-count]').forEach((el) => { el.textContent = checked ? `${checked} selected` : 'None selected' })
    }
    sync()
    form.addEventListener('change', sync)
    form.addEventListener('reset', () => setTimeout(sync))
    return () => form.removeEventListener('change', sync)
  }, [])
  return <input ref={ref} type="checkbox" aria-label={label} className="size-4 accent-[#1d5fa7]"
    onChange={(e) => e.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[name=ids]').forEach((b) => { b.checked = e.currentTarget.checked })} />
}

/** A select that submits its form as soon as the value changes. */
export function AutoSubmitSelect({ name, defaultValue, options, className, label }: { name: string; defaultValue: string; options: { value: string; label: string }[]; className?: string; label: string }) {
  return <select aria-label={label} name={name} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()} className={className}>
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
}

/** Opens its children in a native modal dialog. Forms inside close it on success. */
export function Modal({ trigger, title, description, children, triggerClassName, wide, defaultOpen }: { trigger: ReactNode; title: string; description?: string; children: ReactNode; triggerClassName?: string; wide?: boolean; defaultOpen?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (defaultOpen && !ref.current?.open) ref.current?.showModal() }, [defaultOpen])
  return <>
    <button type="button" className={triggerClassName ?? primaryButton} onClick={() => ref.current?.showModal()}>{trigger}</button>
    <dialog ref={ref} onClick={(e) => { if (e.target === ref.current) ref.current?.close() }} className={cn('m-auto w-[calc(100%-2rem)] rounded-2xl border border-[#dfe7f0] bg-white p-0 text-[#14233b] shadow-2xl backdrop:bg-[#061a34]/50', wide ? 'max-w-2xl' : 'max-w-lg')}>
      <div className="flex items-start justify-between gap-4 border-b border-[#edf1f5] px-6 py-4">
        <div><h2 className="text-base font-bold">{title}</h2>{description && <p className="mt-0.5 text-xs text-[#718096]">{description}</p>}</div>
        <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="rounded-lg p-1.5 text-[#718096] hover:bg-[#f4f7fb]"><X className="size-4" /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{children}</div>
    </dialog>
  </>
}

/** Shows short-lived confirmations raised by forms inside dialogs. Mounted once in the admin shell. */
export function Toaster() {
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])
  useEffect(() => {
    const onToast = (e: Event) => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t, { id, text: (e as CustomEvent<string>).detail }])
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000)
    }
    window.addEventListener('admin-toast', onToast)
    return () => window.removeEventListener('admin-toast', onToast)
  }, [])
  return <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
    {toasts.map((t) => <div key={t.id} role="status" className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-[#c7e9d4] bg-white p-3.5 text-sm font-semibold text-[#14233b] shadow-lg">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#267448]" /><span className="flex-1">{t.text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="text-[#8996a8] hover:text-[#14233b]"><X className="size-4" /></button>
    </div>)}
  </div>
}
