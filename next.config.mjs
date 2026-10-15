/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Email attachments are capped at 10 MB in the app; leave room for multipart overhead.
      bodySizeLimit: '12mb',
    },
  },
}

export default nextConfig
