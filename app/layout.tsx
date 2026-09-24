import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Assistant',
  description: 'Chat with Ollama web APIs',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
