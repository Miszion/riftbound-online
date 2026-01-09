'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function Header() {
  const { user, logout } = useAuth()
  const displayName = user?.username || user?.email || user?.userId || 'Player'
  const avatarLetter = displayName.trim().charAt(0).toUpperCase()
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  const navLinks = user
    ? [
        { href: '/matchmaking', label: 'Matchmaking' },
        { href: '/spectate', label: 'Spectate' },
        { href: '/deckbuilder', label: 'Deckbuilder' },
      ]
    : [{ href: '/sign-in', label: 'Sign In' }]

  const toggleMenu = () => setMenuOpen((prev) => !prev)
  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    const initial = getPreferredTheme()
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const getPreferredTheme = (): 'light' | 'dark' => {
    if (typeof window === 'undefined') {
      return 'dark'
    }
    const stored = window.localStorage.getItem('rift-theme')
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
    return prefersLight ? 'light' : 'dark'
  }

  const applyTheme = (value: 'light' | 'dark') => {
    if (typeof document === 'undefined') {
      return
    }
    document.documentElement.dataset.theme = value
  }

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('rift-theme', next)
    }
    applyTheme(next)
  }

  const isLightMode = theme === 'light'

  return (
    <header className="site-header">
      <div className="container header-bar">
        <div className="brand-group">
          <button
            type="button"
            className={`nav-toggle modern${menuOpen ? ' open' : ''}`}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <span className="nav-toggle__bar" />
            <span className="nav-toggle__bar" />
            <span className="nav-toggle__bar" />
          </button>
          <Link href="/" className="logo-link" aria-label="Return to home">
            <span className="logo-mark" aria-hidden="true">
              <Image
                src="/images/riftbound-logo.png"
                alt=""
                width={146}
                height={48}
                priority
              />
            </span>
            <span className="sr-only">Riftbound Online</span>
          </Link>
          <nav className="desktop-nav">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${isLightMode ? 'dark' : 'light'} mode`}
            title={`Switch to ${isLightMode ? 'dark' : 'light'} mode`}
          >
            <span aria-hidden="true" className="theme-toggle__icon">
              {isLightMode ? '🌙' : '☀️'}
            </span>
          </button>
          {user ? (
            <>
              <div className="user-avatar" aria-hidden="true">
                {avatarLetter || 'U'}
              </div>
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
      <aside className={`side-nav${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
        <div className="side-nav-header">
          <div>
            <p className="muted small">Main Navigation</p>
            <strong>Welcome, {displayName}</strong>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            className="close-nav"
            onClick={closeMenu}
          >
            ×
          </button>
        </div>
        <nav className="side-nav-links">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} onClick={closeMenu}>
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
        {user && (
          <div className="side-nav-footer">
            <button className="btn secondary block" onClick={() => { logout(); closeMenu(); }}>
              Sign Out
            </button>
          </div>
        )}
      </aside>
      <div
        className={`side-nav-overlay${menuOpen ? ' open' : ''}`}
        onClick={closeMenu}
        aria-hidden="true"
      />
    </header>
  )
}
