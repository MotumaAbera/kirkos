'use client'

import { Printer } from 'lucide-react'
import { primaryButton } from '@/components/admin/ui'

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className={primaryButton}><Printer className="size-4" />Print</button>
}
