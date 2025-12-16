'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function Header() {
  const { user, logout } = useAuth()
  const displayName = user?.username || user?.email || user?.userId
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = user
    ? [
        { href: '/spectate', label: 'Spectate' },
        { href: '/matchmaking', label: 'Matchmaking' },
        { href: '/deckbuilder', label: 'Deckbuilder' },
      ]
    : [{ href: '/sign-in', label: 'Sign In' }]

  const toggleMenu = () => setMenuOpen((prev) => !prev)
  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="site-header">
      <div className="container header-bar">
        <div className="brand-group">
          <button
            type="button"
            className={`nav-toggle${menuOpen ? ' open' : ''}`}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <span />
            <span />
            <span />
          </button>
          <Link href="/" className="logo-link" aria-label="Return to home">
            <h1 className="logo">Riftbound Online</h1>
          </Link>
          <nav className={`nav-menu${menuOpen ? ' open' : ''}`}>
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="nav-menu-link" onClick={closeMenu}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="header-actions">
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
        </div>
      </div>
    </header>
  )
}
