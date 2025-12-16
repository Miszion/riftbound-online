'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import RequireAuth from '@/components/auth/RequireAuth';
import { useAuth } from '@/hooks/useAuth';
import GameBoard from '@/components/GameBoard';

export default function GamePage() {
  return (
    <RequireAuth>
      <GamePageContent />
    </RequireAuth>
  );
}

function GamePageContent() {
  const { user } = useAuth();
  const [matchIdInput, setMatchIdInput] = useState('');
  const [playerOverride, setPlayerOverride] = useState('');
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  const effectivePlayerId = playerOverride || user?.userId || '';

  const handleLoadMatch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!matchIdInput.trim() || !effectivePlayerId.trim()) {
      return;
    }
    setActiveMatchId(matchIdInput.trim());
    setActivePlayerId(effectivePlayerId.trim());
  };

  const resetBoard = () => {
    setActiveMatchId(null);
    setActivePlayerId(null);
  };

  return (
    <>
      <Header />
      <main className="game-page container">
        <section className="game-controls">
          <div>
            <h2>Arena Console</h2>
            <p className="muted">
              Enter a match identifier to jump directly into an in-progress
              battle. By default the player id is set to your signed-in account.
              Use the override field to inspect a different participant if
              needed.
            </p>
          </div>
          <form className="game-form" onSubmit={handleLoadMatch}>
            <label>
              Match ID
              <input
                type="text"
                placeholder="match-123"
                value={matchIdInput}
                onChange={(event) => setMatchIdInput(event.target.value)}
                required
              />
            </label>
            <label>
              Player ID <span className="hint">(defaults to you)</span>
              <input
                type="text"
                placeholder={user?.userId ?? 'player-abc'}
                value={playerOverride}
                onChange={(event) => setPlayerOverride(event.target.value)}
              />
            </label>
            <div className="actions">
              <button type="submit" className="cta">
                Load Match
              </button>
              {activeMatchId && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={resetBoard}
                >
                  Clear Board
                </button>
              )}
            </div>
          </form>
        </section>

        {activeMatchId && activePlayerId ? (
          <div className="gameboard-shell">
            <GameBoard matchId={activeMatchId} playerId={activePlayerId} />
          </div>
        ) : (
          <div className="gameboard-placeholder">
            <div className="placeholder-card">
              <h3>Awaiting Match Selection</h3>
              <p className="muted">
                Start a match from the matchmaking page or supply an existing
                match id to visualize the live game state here.
              </p>
            </div>
          </div>
        )}
      </main>
      <Footer />

      <style jsx>{`
        .game-page {
          padding-top: 24px;
          padding-bottom: 48px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .game-controls {
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 16px;
          padding: 24px;
          background: rgba(15, 23, 42, 0.6);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .game-form {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
          align-items: end;
        }

        .game-form label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-weight: 600;
        }

        .game-form input {
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 10px 12px;
          background: rgba(15, 23, 42, 0.5);
          color: inherit;
        }

        .hint {
          font-weight: 400;
          margin-left: 6px;
          font-size: 12px;
          color: rgba(226, 232, 240, 0.7);
        }

        .actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .gameboard-shell {
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.3);
        }

        .gameboard-placeholder {
          border: 1px dashed rgba(148, 163, 184, 0.4);
          border-radius: 16px;
          padding: 40px;
          display: flex;
          justify-content: center;
          align-items: center;
          background: rgba(15, 23, 42, 0.4);
          min-height: 320px;
        }

        .placeholder-card {
          max-width: 420px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        @media (max-width: 768px) {
          .game-form {
            grid-template-columns: 1fr;
          }
          .actions {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </>
  );
}
