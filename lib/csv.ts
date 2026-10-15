const cell = (value: unknown) => {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  // Prefix formula-like values so spreadsheet apps don't execute them.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** CSV text with a UTF-8 BOM so Excel shows Amharic and other non-Latin text correctly. */
export function toCsv(headers: string[], rows: unknown[][]) {
  return `﻿${[headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}`
}
