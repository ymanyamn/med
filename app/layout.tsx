import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from 'next/font/google'
import './globals.css'

const _plexArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'] })
const _plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'] })

export const metadata: Metadata = {
  title: 'med | الدفاع المدني السوري',
  description: 'تطبيق الدفاع المدني السوري للبلاغات والحالات الطارئة - رجال الدفاع المدني معك أينما تكون',
  applicationName: 'med',
  appleWebApp: { capable: true, title: 'med', statusBarStyle: 'default' },
  icons: { icon: '/icon-512.png', apple: '/icon-512.png' },
}

export const viewport: Viewport = {
  themeColor: '#1d6b40',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" className="bg-background">
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
