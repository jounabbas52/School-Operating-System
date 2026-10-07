import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata = {
  title: 'School Management System',
  description: 'Multi-tenant school management platform',
}

// Runs before first paint, so a dark-theme user never sees a white flash.
// It only stamps data-theme for an explicit choice -- "system" leaves the
// attribute off and lets prefers-color-scheme decide.
const THEME_INIT = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
`

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      {/*
        suppressHydrationWarning on <body> because extensions inject attributes
        before React hydrates -- ColorZilla adds cz-shortcut-listen, Grammarly
        adds data-gr-*. On <html> it covers the data-theme the script above
        sets, which the server could not have known about.
      */}
      <body suppressHydrationWarning className="min-h-full">
        {children}
      </body>
    </html>
  )
}
