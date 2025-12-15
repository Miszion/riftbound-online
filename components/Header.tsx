'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function Header() {
  const { user, logout } = useAuth()
  const displayName = user?.username || user?.email || user?.userId

  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="logo-link" aria-label="Return to home">
          <h1 className="logo">Riftbound Online</h1>
        </Link>
        <nav>
          {user && (
            <>
              <Link href="/spectate" className="btn">
                Spectate
              </Link>
              <Link href="/matchmaking" className="btn">
                Matchmaking
              </Link>
              <Link href="/deckbuilder" className="btn">
                Deckbuilder
              </Link>
            </>
          )}
          {user ? (
            <>
              <span className="user-pill">{displayName}</span>
              <button className="btn secondary" onClick={logout}>
                Sign Out
              </button>
            </>
          ) : (
            <Link href="/sign-in" className="btn">
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
