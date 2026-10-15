import Link from 'next/link'
import { Lock } from 'lucide-react'
import { primaryButton } from '@/components/admin/ui'
import { requireStaff } from '@/lib/auth'
import { PERMISSION_INFO } from '@/lib/rbac'

export default async function AccessDeniedPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const staff = await requireStaff()
  const { need } = await searchParams
  const label = PERMISSION_INFO.find((p) => p.key === need)?.label
  return <div className="mx-auto mt-10 max-w-md rounded-2xl border border-[#dfe7f0] bg-white p-8 text-center shadow-sm">
    <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#fff0f1] text-[#b32d3d]"><Lock className="size-5" /></span>
    <h1 className="mt-4 text-lg font-bold">You don&apos;t have access to this page</h1>
    <p className="mt-2 text-sm leading-6 text-[#718096]">Your role <b className="text-[#14233b]">{staff.role}</b> doesn&apos;t include the {label ? <b className="text-[#14233b]">{label}</b> : 'required'} permission. Ask an administrator if you need it.</p>
    <Link href="/admin" className={`${primaryButton} mt-6`}>Back to overview</Link>
  </div>
}
