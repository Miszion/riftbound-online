'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useAuth } from '@/hooks/useAuth'

type Mode = 'sign-in' | 'sign-up'

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { signIn, signUp } = useAuth()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setStatus(null)
    setLoading(true)

    try {
      if (mode === 'sign-in') {
        await signIn(email, password)
        router.push('/')
      } else {
        await signUp({ email, password, username })
        setStatus('Account created! Please sign in.')
        setMode('sign-in')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setError(null)
    setStatus(null)
    setMode((prev) => (prev === 'sign-in' ? 'sign-up' : 'sign-in'))
  }

  return (
    <>
      <Header />
      <main className="sign-container">
        <div className="sign-card">
          <h2>{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h2>
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            {mode === 'sign-up' && (
              <>
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength={3}
                  required
                />
              </>
            )}

            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            />

            {error && (
              <p className="muted small" style={{ color: 'var(--danger-color)' }}>
                {error}
              </p>
            )}
            {status && (
              <p className="muted small" style={{ color: 'var(--success-color)' }}>
                {status}
              </p>
            )}

            <button className="primary" type="submit" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'sign-in' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <p className="muted small">
            {mode === 'sign-in' ? 'Need an account?' : 'Already registered?'}{' '}
            <button
              type="button"
              onClick={toggleMode}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--primary-color)',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              {mode === 'sign-in' ? 'Create one' : 'Sign in instead'}
            </button>
          </p>
          <p className="muted small">
            <Link href="/">Return to home</Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
