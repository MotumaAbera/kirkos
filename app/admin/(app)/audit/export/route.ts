import type { NextRequest } from 'next/server'
import { exportResponse } from '@/lib/export-route'

export const GET = (request: NextRequest) => exportResponse('audit', request)
