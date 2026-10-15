/** Single source for the public site's navigation (header, mobile menu, footer). */
export const PUBLIC_NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/services', label: 'Services' },
  { href: '/complaint', label: 'Report' },
  { href: '/track', label: 'Track' },
  { href: '/pay', label: 'Pay & appeal' },
  { href: '/contact', label: 'Contact' },
] as const

/** Shared page container so every public page lines up with the header. */
export const container = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8'
