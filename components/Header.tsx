'use client'

import Link from 'next/link'

export default function Header() {
  return (
    <header className="site-header">
      <div className="container">
        <h1 className="logo">Riftbound Online</h1>
        <nav>
          <Link href="/sign-in" className="btn">
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  )
}
