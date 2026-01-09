import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Providers from './providers'
import '../styles/globals.css'
import '../css/styles.css'
import '../styles/game-board.css'
import GlobalLoadingOverlay from '@/components/ui/GlobalLoadingOverlay'
import ToastProvider from '@/components/ui/ToastProvider'

export const metadata: Metadata = {
  title: 'Riftbound Online',
  description: 'A fan-made landing page inspired by the Riftbound card game from League of Legends',
}

const themeInitScript = `
!(function() {
  try {
    var storedTheme = localStorage.getItem('rift-theme');
    var theme = storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <ToastProvider>
            <GlobalLoadingOverlay />
            {children}
          </ToastProvider>
        </Providers>
      </body>
    </html>
  )
}
