'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useRecentMatches } from '@/hooks/useGraphQL';

type BadgeTone = 'green' | 'amber' | 'slate' | 'red' | 'blue';

interface RecentMatch {
  matchId: string;
  players?: string[] | null;
  winner?: string | null;
  loser?: string | null;
  duration?: number | null;
  turns?: number | null;
  createdAt?: string | number | null;
  status?: string | null;
  endReason?: string | null;
}

const BADGE_TONE_STYLE: Record<BadgeTone, React.CSSProperties> = {
  green: {
    background: 'rgba(16,185,129,0.15)',
    color: '#6ee7b7',
    border: '1px solid rgba(16,185,129,0.3)',
  },
  amber: {
    background: 'rgba(245,158,11,0.15)',
    color: '#fbbf24',
    border: '1px solid rgba(245,158,11,0.3)',
  },
  slate: {
    background: 'rgba(100,116,139,0.15)',
    color: '#cbd5f5',
    border: '1px solid rgba(100,116,139,0.3)',
  },
  red: {
    background: 'rgba(244,63,94,0.15)',
    color: '#fda4af',
    border: '1px solid rgba(244,63,94,0.3)',
  },
  blue: {
    background: 'rgba(14,165,233,0.15)',
    color: '#7dd3fc',
    border: '1px solid rgba(14,165,233,0.3)',
  },
};

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getStatusBadge(
  status: string | null | undefined,
  endReason: string | null | undefined
): { label: string; tone: BadgeTone } {
  if (status === 'completed') {
    if (endReason === 'victory_points')
      return { label: 'Victory Points', tone: 'green' };
    if (endReason === 'burn_out') return { label: 'Burn-out', tone: 'amber' };
    if (endReason === 'concede') return { label: 'Concede', tone: 'slate' };
    if (
      endReason === 'timeout' ||
      endReason === 'turn_cap' ||
      endReason === 'action_cap'
    ) {
      return { label: 'Timeout', tone: 'slate' };
    }
    return { label: 'Completed', tone: 'slate' };
  }
  if (status === 'abandoned') {
    if (
      endReason === 'crashed' ||
      endReason === 'invariant' ||
      endReason === 'infinite_loop'
    ) {
      return { label: 'Error', tone: 'red' };
    }
    return { label: 'Abandoned', tone: 'red' };
  }
  if (status === 'in_progress' || status == null) {
    return { label: 'In Progress', tone: 'blue' };
  }
  return { label: capitalize(status), tone: 'slate' };
}

function shortId(id: string): string {
  if (!id) return '—';
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function formatWhen(value: string | number | null | undefined): string {
  if (!value) return '—';
  let ts: number;
  if (typeof value === 'number') {
    ts = value;
  } else {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      ts = parsed;
    } else {
      const asNum = Number(value);
      if (Number.isFinite(asNum)) {
        ts = asNum;
      } else {
        return String(value);
      }
    }
  }
  const now = Date.now();
  const diff = now - ts;
  if (diff < 0 || !Number.isFinite(diff)) {
    return new Date(ts).toLocaleString();
  }
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDuration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  const totalSeconds = Math.round(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

const toggleBtnStyle: React.CSSProperties = {
  position: 'fixed',
  top: 88,
  right: 16,
  zIndex: 180,
  background: 'rgba(8,10,22,0.85)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#f4f6fb',
  padding: '8px 14px',
  borderRadius: 999,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 0.4,
  backdropFilter: 'blur(10px)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const backdropStyle = (open: boolean): React.CSSProperties => ({
  position: 'fixed',
  inset: 0,
  background: 'rgba(4,6,15,0.55)',
  opacity: open ? 1 : 0,
  pointerEvents: open ? 'auto' : 'none',
  transition: 'opacity 0.2s ease',
  zIndex: 210,
});

const drawerStyle = (open: boolean): React.CSSProperties => ({
  position: 'fixed',
  top: 0,
  right: 0,
  width: 'min(420px, 92vw)',
  height: '100vh',
  background: 'rgba(8,10,22,0.98)',
  borderLeft: '1px solid rgba(255,255,255,0.12)',
  zIndex: 220,
  transform: open ? 'translateX(0)' : 'translateX(100%)',
  transition: 'transform 0.25s ease',
  display: 'flex',
  flexDirection: 'column',
  color: '#f4f6fb',
  boxShadow: '-18px 0 40px rgba(0,0,0,0.45)',
});

const drawerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  gap: 8,
};

const drawerBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 16px 24px',
};

const matchRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
  marginBottom: 8,
};

const metaLineStyle: React.CSSProperties = {
  color: 'rgba(244,246,251,0.6)',
  fontSize: 12,
  lineHeight: 1.4,
};

const rowBtnStyle: React.CSSProperties = {
  marginTop: 8,
  alignSelf: 'flex-start',
  background: 'rgba(99,102,241,0.22)',
  border: '1px solid rgba(99,102,241,0.55)',
  color: '#e0e7ff',
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
};

const rowBtnActiveStyle: React.CSSProperties = {
  ...rowBtnStyle,
  background: 'rgba(99,102,241,0.55)',
  borderColor: 'rgba(99,102,241,0.9)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#f4f6fb',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 4,
};

const refreshBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#f4f6fb',
  padding: '4px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const badgeStyle = (tone: BadgeTone): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 500,
  ...BADGE_TONE_STYLE[tone],
});

export interface ReplayDrawerProps {
  /**
   * Current match id in the URL (matchId segment of /game/:id or /replay/:id).
   * Used purely to highlight the active row in the list.
   */
  currentMatchId?: string | null;
  /** Initial open state; consumer typically uses the built-in toggle button. */
  defaultOpen?: boolean;
  /**
   * When true the drawer still mounts but hides its floating toggle pill.
   * Useful when the host wants to drive open/close from an external control.
   */
  hideToggle?: boolean;
}

/**
 * Floating, side drawer that lists recent matches from anywhere the GameBoard
 * is mounted. Selecting a match navigates to /replay/[matchId]; the target
 * page reuses the same GameBoard component (and the same ReplayControls), so
 * replay discovery lives inside the board experience rather than on a
 * separate top-nav page.
 *
 * The 10-second freshly-ended polling behavior is handled by the /replay
 * route itself (app/replay/[matchId]/page.tsx). This drawer only needs to
 * route the user there and rely on that page's loading state.
 */
export default function ReplayDrawer({
  currentMatchId,
  defaultOpen,
  hideToggle,
}: ReplayDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean>(Boolean(defaultOpen));

  const {
    data,
    loading,
    error,
    refetch,
  } = useRecentMatches(25);

  const recentMatches: RecentMatch[] = useMemo(
    () => data?.recentMatches ?? [],
    [data]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Nudge the query whenever the drawer is opened so a match that just ended
  // shows up without forcing a page refresh.
  useEffect(() => {
    if (!open) return;
    refetch?.().catch(() => {
      // Ignore transient errors; the UI surfaces the Apollo error if any.
    });
  }, [open, refetch]);

  const onSelect = (matchId: string) => {
    if (!matchId) return;
    setOpen(false);
    const target = `/replay/${encodeURIComponent(matchId)}`;
    // Use push so the back button returns the user to where they were —
    // either the live /game/:id board or the previous replay.
    if (pathname === target) {
      // Same route; refresh query params just to remount.
      router.replace(target);
      return;
    }
    router.push(target);
  };

  return (
    <>
      {!hideToggle && (
        <button
          type="button"
          style={toggleBtnStyle}
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="replay-drawer"
        >
          <span aria-hidden="true">🎬</span>
          <span>Replays</span>
        </button>
      )}

      <div
        style={backdropStyle(open)}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="replay-drawer"
        role="dialog"
        aria-label="Recent matches"
        aria-hidden={!open}
        style={drawerStyle(open)}
      >
        <div style={drawerHeaderStyle}>
          <div>
            <strong style={{ fontSize: 15 }}>Recent Matches</strong>
            <div style={{ color: 'rgba(244,246,251,0.6)', fontSize: 12 }}>
              Watch any replay inside the board.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              style={refreshBtnStyle}
              onClick={() => refetch?.()}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              style={closeBtnStyle}
              onClick={() => setOpen(false)}
              aria-label="Close replays drawer"
            >
              ×
            </button>
          </div>
        </div>

        <div style={drawerBodyStyle}>
          {error && (
            <p style={{ ...metaLineStyle, color: '#fda4af' }} role="alert">
              Failed to load recent matches: {error.message}
            </p>
          )}
          {recentMatches.length === 0 && !loading && !error && (
            <p style={metaLineStyle}>
              No matches recorded yet. Finish a duel and it will appear here.
            </p>
          )}
          {loading && recentMatches.length === 0 && (
            <p style={metaLineStyle}>Loading recent matches…</p>
          )}

          {recentMatches.map((match) => {
            const players = Array.isArray(match.players) ? match.players : [];
            const playerLabel =
              players.length >= 2
                ? `${shortId(players[0])} vs ${shortId(players[1])}`
                : players.map(shortId).join(', ') || '—';
            const winnerLabel = match.winner ? shortId(match.winner) : '—';
            const badge = getStatusBadge(match.status, match.endReason);
            const isActive = currentMatchId === match.matchId;
            return (
              <div key={match.matchId} style={matchRowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>
                    {shortId(match.matchId)}
                  </strong>
                  <span style={badgeStyle(badge.tone)}>{badge.label}</span>
                  {isActive && (
                    <span style={{ ...metaLineStyle, marginLeft: 'auto' }}>
                      Viewing
                    </span>
                  )}
                </div>
                <div style={metaLineStyle}>{playerLabel}</div>
                <div style={metaLineStyle}>
                  Winner: {winnerLabel} · Turns: {match.turns ?? '—'} ·{' '}
                  {formatDuration(match.duration)} ·{' '}
                  {formatWhen(match.createdAt)}
                </div>
                <button
                  type="button"
                  style={isActive ? rowBtnActiveStyle : rowBtnStyle}
                  onClick={() => onSelect(match.matchId)}
                  disabled={isActive}
                >
                  {isActive ? 'Already watching' : 'Watch Replay'}
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
