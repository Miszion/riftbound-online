'use client';

/**
 * Replay playback bar. Renders as a fixed overlay so it sits above the real
 * GameBoard without disrupting its layout.
 *
 * Kept deliberately self-contained: no global styles required, uses inline
 * styles for the overlay so this ships with the GameBoard replay feature even
 * if the CSS bundle is stale.
 */

import React from 'react';

export type ReplayControlsProps = {
  moveIndex: number;
  totalMoves: number;
  playing: boolean;
  speed: number;
  currentPhase: string;
  turnNumber: number;
  perspectivePlayerId: string | null;
  availablePlayerIds: string[];
  onPlayPauseToggle: () => void;
  onStep: (delta: number) => void;
  onScrub: (index: number) => void;
  onSpeedChange: (speed: number) => void;
  onPerspectiveChange: (playerId: string) => void;
};

const barStyle: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 200,
  padding: '12px 20px',
  background: 'linear-gradient(180deg, rgba(8,10,22,0.75), rgba(8,10,22,0.95))',
  borderTop: '1px solid rgba(255,255,255,0.12)',
  color: '#f4f6fb',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  fontSize: 14,
  backdropFilter: 'blur(10px)',
  flexWrap: 'wrap',
};

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#f4f6fb',
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'rgba(99,102,241,0.35)',
  borderColor: 'rgba(99,102,241,0.7)',
};

export default function ReplayControls({
  moveIndex,
  totalMoves,
  playing,
  speed,
  currentPhase,
  turnNumber,
  perspectivePlayerId,
  availablePlayerIds,
  onPlayPauseToggle,
  onStep,
  onScrub,
  onSpeedChange,
  onPerspectiveChange,
}: ReplayControlsProps) {
  const atStart = moveIndex <= 0;
  const atEnd = moveIndex >= totalMoves;

  return (
    <div style={barStyle} role="region" aria-label="Replay controls">
      <strong style={{ marginRight: 8 }}>Replay</strong>
      <button
        style={btnStyle}
        onClick={() => onStep(-1)}
        disabled={atStart}
        aria-label="Step back"
      >
        &larr;
      </button>
      <button
        style={btnStyle}
        onClick={onPlayPauseToggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <button
        style={btnStyle}
        onClick={() => onStep(1)}
        disabled={atEnd}
        aria-label="Step forward"
      >
        &rarr;
      </button>

      <span style={{ opacity: 0.8, minWidth: 120 }}>
        move {moveIndex} / {totalMoves}
      </span>

      <input
        type="range"
        min={0}
        max={totalMoves}
        value={moveIndex}
        onChange={(event) => onScrub(Number(event.target.value))}
        style={{ flex: 1, minWidth: 160 }}
        aria-label="Scrub replay"
      />

      <div style={{ display: 'flex', gap: 4 }} aria-label="Playback speed">
        {[1, 2, 4].map((s) => (
          <button
            key={s}
            style={s === speed ? activeBtnStyle : btnStyle}
            onClick={() => onSpeedChange(s)}
          >
            {s}x
          </button>
        ))}
      </div>

      <span style={{ opacity: 0.8 }}>
        Turn {turnNumber} &middot; {currentPhase || '—'}
      </span>

      {availablePlayerIds.length > 1 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ opacity: 0.8 }}>View as:</span>
          <select
            value={perspectivePlayerId ?? ''}
            onChange={(event) => onPerspectiveChange(event.target.value)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#f4f6fb',
              border: '1px solid rgba(255,255,255,0.15)',
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            {availablePlayerIds.map((pid) => (
              <option key={pid} value={pid}>
                {pid}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
