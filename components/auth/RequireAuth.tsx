'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  if (!user) {
    return (
      <div className="protected-gate">
        <div className="protected-card">
          <h2>Sign in required</h2>
          <p className="muted">
            Access to Deckbuilder, Matchmaking, and Spectate is restricted. Please sign in to continue.
          </p>
          <Link href="/sign-in" className="btn primary">
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
