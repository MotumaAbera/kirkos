import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'AACEA – Addis Ababa Code Enforcement Authority', template: '%s · AACEA' },
  description: 'Addis Ababa City Administration Code Enforcement Authority civic reporting and operations portal.',
  icons: {
    icon: [{ url: '/icon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/logo-256.png', sizes: '256x256', type: 'image/png' }],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  // The site is designed light-only; declaring dark support made form controls render dark on dark-mode phones.
  colorScheme: 'light',
  themeColor: '#082957',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
