'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function SignIn() {
  const [email, setEmail] = useState('')

  const handleSignIn = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    alert(`Signed in as ${email} (mock)`)
  }

  return (
    <>
      <Header />
      <main className="sign-container">
        <div className="sign-card">
          <h2>Sign in</h2>
          <form onSubmit={handleSignIn}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
            />

            <button className="primary" type="submit">
              Sign In
            </button>
          </form>
          <p className="muted small">
            This is a static mock — form does not send to a server.
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
