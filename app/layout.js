import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata = {
  title: 'School Management System',
  description: 'Multi-tenant school management platform',
}

// Runs before first paint, so a dark-theme user never sees a white flash.
//
// An explicit choice stamps data-theme. "system" deliberately stamps nothing
// and lets prefers-color-scheme decide. Nothing stored at all -- a first
// visit -- is NOT the same as "system": the console opens dark, which is the
// look it was designed around. The moment anyone picks a theme their choice
// is stored and this branch stops applying.
//
// The catch matters: localStorage throws outright in a private window or
// with site data blocked, and an exception here would leave the page on the
// light palette, so dark is stamped on the way out too.
const THEME_INIT = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else if (t !== 'system') document.documentElement.setAttribute('data-theme', 'dark');
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'dark');
}
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
