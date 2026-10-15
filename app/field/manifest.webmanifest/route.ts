/** Web app manifest so inspectors can install the field app to their phone's home screen. */
export function GET() {
  return Response.json({
    name: 'AACEA Field',
    short_name: 'AACEA Field',
    description: 'Field app for AACEA inspectors: assigned cases, check-ins, evidence, and citations.',
    start_url: '/field',
    scope: '/field',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#082957',
    theme_color: '#082957',
    icons: [
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/logo-256.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json' } })
}
