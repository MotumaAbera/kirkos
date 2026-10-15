export const formatBirr = (amount: number | string) => `ETB ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Splits a total into n installments in cents, putting any rounding remainder on the last one. */
export function splitInstallments(total: number, n: number) {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cents - base * (n - 1) : base) / 100)
}
