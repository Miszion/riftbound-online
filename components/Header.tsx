'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function Header() {
  const { user, logout } = useAuth()

  return (
    <header className="site-header">
      <div className="container">
        <h1 className="logo">Riftbound Online</h1>
        <nav>
          <Link href="/spectate" className="btn">
            Spectate
          </Link>
          <Link href="/matchmaking" className="btn">
            Matchmaking
          </Link>
          <Link href="/deckbuilder" className="btn">
            Deckbuilder
          </Link>
          {user ? (
            <>
              <span className="user-pill">
                {user.email ?? user.userId}
              </span>
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
