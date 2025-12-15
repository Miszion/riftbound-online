import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Providers from './providers'
import '../styles/globals.css'
import GlobalLoadingOverlay from '@/components/ui/GlobalLoadingOverlay'

export const metadata: Metadata = {
  title: 'Riftbound Online',
  description: 'A fan-made landing page inspired by the Riftbound card game from League of Legends',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <GlobalLoadingOverlay />
          {children}
        </Providers>
      </body>
    </html>
  )
}
