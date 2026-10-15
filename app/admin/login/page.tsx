import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { login } from '@/app/admin/actions'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { inputClass, labelClass, primaryButton } from '@/components/admin/ui'
import { getSession } from '@/lib/auth'

export const metadata = { title: 'Staff sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect('/admin')
  const { next } = await searchParams
  return <main className="flex min-h-screen items-center justify-center bg-[#082957] px-4 py-10">
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center text-white">
        <Link href="/" aria-label="Public website"><Image src="/logo-128.png" alt="AACEA emblem" width={72} height={72} priority className="size-[72px] rounded-full bg-white p-1 shadow-lg" /></Link>
        <h1 className="mt-4 text-xl font-bold">AACEA staff workspace</h1>
        <p className="mt-1 text-sm text-[#b9c9dd]">Sign in to manage cases and services.</p>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-2xl">
        <ActionForm action={login} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? ''} />
          <label className={labelClass}>Work email<input name="email" type="email" autoComplete="username" required autoFocus className={inputClass} /></label>
          <label className={labelClass}>Password<input name="password" type="password" autoComplete="current-password" required className={inputClass} /></label>
          <SubmitButton className={`${primaryButton} mt-2 w-full`} pendingText="Signing in…">Sign in</SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-6 text-center text-xs text-[#9fb4cf]">Access is restricted to authorized authority staff. All sign-ins are recorded.</p>
    </div>
  </main>
}
