'use client'

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL } from '@/lib/apiConfig'

export interface AuthSession {
  userId: string
  email: string
  username?: string
  idToken: string
  accessToken: string
  refreshToken: string
  expiresAt: number
}

interface SignInResponse {
  userId: string
  email: string
  username?: string
  idToken: string
  accessToken: string
  refreshToken: string
  expiresAt?: number
  expiresIn?: number
}

interface RefreshResponse {
  userId: string | null
  idToken: string
  accessToken: string
  refreshToken: string
  expiresAt?: number
  expiresIn?: number
}

interface AuthContextValue {
  user: AuthSession | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (params: { email: string; password: string; username: string }) => Promise<string>
  refreshSession: () => Promise<void>
  logout: () => void
}

const STORAGE_KEY = 'riftbound:user'

const decodeJwtClaims = (token?: string): Record<string, any> | null => {
  if (!token || typeof window === 'undefined' || typeof window.atob !== 'function') {
    return null
  }
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = window.atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

const deriveUsername = (token?: string, fallback?: string): string | undefined => {
  const claims = decodeJwtClaims(token)
  return (
    claims?.preferred_username ||
    claims?.['cognito:username'] ||
    claims?.username ||
    fallback
  )
}

const toSession = (payload: SignInResponse): AuthSession => {
  const fallbackExpiry = payload.expiresIn ? Date.now() + payload.expiresIn * 1000 : Date.now() + 3600 * 1000
  const username = payload.username ?? deriveUsername(payload.idToken, payload.email)
  return {
    userId: payload.userId,
    email: payload.email,
    username,
    idToken: payload.idToken,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt ?? fallbackExpiry,
  }
}

const authRequest = async <T,>(path: string, body: Record<string, unknown>): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let message = 'Request failed'
    try {
      const errorBody = await response.json()
      if (typeof errorBody?.error === 'string') {
        message = errorBody.error
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(message)
  }

  return (await response.json()) as T
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthSession | null>(null)
  const refreshTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistSession = useCallback((session: AuthSession) => {
    setUser(session)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return
    }
    try {
      const parsed = JSON.parse(stored) as AuthSession
      if (parsed?.userId && parsed?.refreshToken) {
        setUser(parsed)
      } else {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    if (refreshTimeout.current) {
      clearTimeout(refreshTimeout.current)
      refreshTimeout.current = null
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const data = await authRequest<SignInResponse>('/auth/sign-in', { email, password })
      persistSession(toSession(data))
    },
    [persistSession]
  )

  const signUp = useCallback(async (params: { email: string; password: string; username: string }) => {
    const response = await authRequest<{ message: string }>('/auth/sign-up', params)
    return response.message
  }, [])

  const refreshSession = useCallback(async () => {
    if (!user?.refreshToken) {
      throw new Error('No refresh token available')
    }
    const response = await authRequest<RefreshResponse>('/auth/refresh', {
      refreshToken: user.refreshToken,
    })
    const nextSession: AuthSession = {
      userId: response.userId || user.userId,
      email: user.email,
       username: deriveUsername(response.idToken, user.username || user.email),
      idToken: response.idToken,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken || user.refreshToken,
      expiresAt:
        response.expiresAt ||
        (response.expiresIn ? Date.now() + response.expiresIn * 1000 : Date.now() + 3600 * 1000),
    }
    persistSession(nextSession)
  }, [user, persistSession])

  useEffect(() => {
    if (!user?.refreshToken) {
      return
    }

    if (refreshTimeout.current) {
      clearTimeout(refreshTimeout.current)
    }

    const msUntilRefresh = Math.max(user.expiresAt - Date.now() - 60_000, 5_000)
    refreshTimeout.current = setTimeout(() => {
      refreshSession().catch((error) => {
        console.error('Session refresh failed', error)
        logout()
      })
    }, msUntilRefresh)

    return () => {
      if (refreshTimeout.current) {
        clearTimeout(refreshTimeout.current)
        refreshTimeout.current = null
      }
    }
  }, [user, refreshSession, logout])

  const value = useMemo(
    () => ({
      user,
      signIn,
      signUp,
      refreshSession,
      logout,
    }),
    [user, signIn, signUp, refreshSession, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
