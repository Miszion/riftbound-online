# GraphQL Implementation Examples

This document provides practical examples of implementing GraphQL operations in your Riftbound Online UI components.

## 1. User Profile Component

```typescript
// app/profile/page.tsx
'use client';

import { useUser, useUpdateUser } from '@/hooks/useGraphQL';
import { useState } from 'react';

export default function ProfilePage({ params }: { params: { userId: string } }) {
  const { data, loading, error } = useUser(params.userId);
  const [updateUser, { loading: updating }] = useUpdateUser();
  const [editName, setEditName] = useState('');

  const handleUpdateUsername = async () => {
    if (!editName.trim()) return;

    try {
      await updateUser({
        variables: {
          userId: params.userId,
          username: editName,
        },
      });
      setEditName('');
      // Component re-renders automatically with updated data
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  if (loading) return <div>Loading profile...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data?.user) return <div>User not found</div>;

  const user = data.user;

  return (
    <div className="profile-container">
      <h1>{user.username}</h1>
      <div className="stats">
        <div>Level: {user.userLevel}</div>
        <div>Wins: {user.wins}</div>
        <div>Total Matches: {user.totalMatches}</div>
        <div>
          Win Rate:{' '}
          {user.totalMatches > 0
            ? ((user.wins / user.totalMatches) * 100).toFixed(1)
            : 0}
          %
        </div>
      </div>

      <div className="edit-section">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="New username"
        />
        <button
          onClick={handleUpdateUsername}
          disabled={updating || !editName.trim()}
        >
          {updating ? 'Updating...' : 'Update Profile'}
        </button>
      </div>
    </div>
  );
}
```

## 2. Leaderboard Component with Real-Time Updates

```typescript
// components/Leaderboard.tsx
'use client';

import { useLeaderboard, useLeaderboardSubscription } from '@/hooks/useGraphQL';
import { useMemo } from 'react';

export function Leaderboard() {
  // Load initial leaderboard data
  const { data: initialData, loading } = useLeaderboard(100);

  // Subscribe to real-time leaderboard updates
  const { data: subscriptionData } = useLeaderboardSubscription();

  // Use subscription data if available, otherwise use initial data
  const leaderboard = useMemo(() => {
    return subscriptionData?.leaderboardUpdated || initialData?.leaderboard || [];
  }, [subscriptionData, initialData]);

  if (loading && !leaderboard.length) return <div>Loading leaderboard...</div>;

  return (
    <div className="leaderboard">
      <h2>Top Players</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Wins</th>
            <th>Matches</th>
            <th>Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry, index) => (
            <tr key={entry.userId} className={index < 3 ? 'top-3' : ''}>
              <td>{index + 1}</td>
              <td>{entry.username}</td>
              <td>{entry.wins}</td>
              <td>{entry.totalMatches}</td>
              <td>{(entry.winRate * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .leaderboard {
          padding: 20px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th {
          text-align: left;
          padding: 10px;
          border-bottom: 2px solid #e94560;
        }

        td {
          padding: 10px;
          border-bottom: 1px solid #ddd;
        }

        tr.top-3 {
          background: rgba(233, 69, 96, 0.1);
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}
```

## 3. Match History Component

```typescript
// components/MatchHistory.tsx
'use client';

import { useMatchHistory } from '@/hooks/useGraphQL';

interface MatchHistoryProps {
  userId: string;
}

export function MatchHistory({ userId }: MatchHistoryProps) {
  const { data, loading, error } = useMatchHistory(userId, 10);

  if (loading) return <div>Loading match history...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const matches = data?.matchHistory || [];

  return (
    <div className="match-history">
      <h3>Recent Matches</h3>
      {matches.length === 0 ? (
        <p>No matches yet</p>
      ) : (
        <div className="matches-list">
          {matches.map((match) => {
            const isWinner = match.winner === userId;
            const duration = new Date(match.duration);
            const minutes = Math.floor(match.duration / 60000);

            return (
              <div
                key={match.matchId}
                className={`match-card ${isWinner ? 'win' : 'loss'}`}
              >
                <div className="result">
                  {isWinner ? '✓ WIN' : '✗ LOSS'}
                </div>
                <div className="details">
                  <div className="date">
                    {new Date(match.timestamp).toLocaleDateString()}
                  </div>
                  <div className="duration">{minutes}m {match.duration % 60000}s</div>
                  <div className="turns">Turn {match.turns}</div>
                </div>
                <div className="opponent">
                  vs {isWinner ? match.loser : match.winner}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .match-history {
          padding: 20px;
        }

        .matches-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 15px;
        }

        .match-card {
          border-radius: 8px;
          padding: 15px;
          display: flex;
          align-items: center;
          gap: 15px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .match-card.win {
          background: rgba(78, 204, 163, 0.2);
          border: 2px solid #4ecca3;
        }

        .match-card.loss {
          background: rgba(233, 69, 96, 0.2);
          border: 2px solid #e94560;
        }

        .match-card:hover {
          transform: translateY(-5px);
        }

        .result {
          font-size: 18px;
          font-weight: bold;
          min-width: 80px;
        }

        .match-card.win .result {
          color: #4ecca3;
        }

        .match-card.loss .result {
          color: #e94560;
        }

        .details {
          flex: 1;
        }

        .date,
        .duration,
        .turns {
          font-size: 12px;
          color: #999;
          margin: 3px 0;
        }

        .opponent {
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}
```

## 4. Active Match Component with Real-Time Updates

```typescript
// components/ActiveMatch.tsx
'use client';

import {
  usePlayerGameStateSubscription,
  usePlayCard,
  useAttack,
  useNextPhase,
  useConcedeMatch,
  usePhaseChangedSubscription,
  useCardPlayedSubscription,
} from '@/hooks/useGraphQL';
import { useState, useEffect } from 'react';

interface ActiveMatchProps {
  matchId: string;
  playerId: string;
  onMatchEnd?: () => void;
}

export function ActiveMatch({
  matchId,
  playerId,
  onMatchEnd,
}: ActiveMatchProps) {
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  // Real-time game state
  const { data: gameData } = usePlayerGameStateSubscription(matchId, playerId);

  // Real-time events
  const { data: phaseData } = usePhaseChangedSubscription(matchId);
  const { data: cardData } = useCardPlayedSubscription(matchId);

  // Actions
  const [playCard, { loading: playingCard }] = usePlayCard();
  const [attack] = useAttack();
  const [nextPhase, { loading: advancingPhase }] = useNextPhase();
  const [concedeMatch] = useConcedeMatch();

  const gameState = gameData?.playerGameStateChanged;

  // Handle card selection and playing
  const handlePlayCard = async () => {
    if (selectedCard === null || !gameState) return;

    try {
      await playCard({
        variables: {
          matchId,
          playerId,
          cardIndex: selectedCard,
        },
      });
      setSelectedCard(null);
    } catch (error) {
      console.error('Failed to play card:', error);
    }
  };

  // Show real-time events
  useEffect(() => {
    if (phaseData?.phaseChanged) {
      const { newPhase } = phaseData.phaseChanged;
      console.log(`Phase changed to: ${newPhase}`);
    }
  }, [phaseData]);

  useEffect(() => {
    if (cardData?.cardPlayed) {
      const { playerId: playerWhoPlayed, card } = cardData.cardPlayed;
      console.log(
        `${playerWhoPlayed === playerId ? 'You' : 'Opponent'} played ${card.name}`
      );
    }
  }, [cardData, playerId]);

  if (!gameState) return <div>Loading match...</div>;

  const { currentPlayer, opponent, gameState: gs } = gameState;

  return (
    <div className="active-match">
      <div className="match-header">
        <h2>Match ID: {matchId}</h2>
        <div className="game-stats">
          <span>Phase: {gs.currentPhase}</span>
          <span>Turn: {gs.turnNumber}</span>
          <span>Status: {gs.canAct ? 'Your Turn' : 'Waiting'}</span>
        </div>
      </div>

      <div className="match-content">
        {/* Opponent Area */}
        <div className="opponent-area">
          <div className="player-header">
            <h3>Opponent</h3>
            <div className="health-bar">
              <div
                className="health-fill"
                style={{
                  width: `${(opponent.health / 20) * 100}%`,
                }}
              />
              <span className="health-text">
                {opponent.health} / 20
              </span>
            </div>
          </div>

          {opponent.board && opponent.board.length > 0 && (
            <div className="creatures">
              {opponent.board.map((creature) => (
                <div key={creature.cardId} className="creature">
                  <div className="name">{creature.name}</div>
                  <div className="stats">
                    {creature.power}/{creature.toughness}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Player Area */}
        <div className="player-area">
          {/* Player Stats */}
          <div className="player-stats">
            <div className="health-bar">
              <div
                className="health-fill"
                style={{
                  width: `${(currentPlayer.health / currentPlayer.maxHealth) * 100}%`,
                }}
              />
              <span className="health-text">
                {currentPlayer.health} / {currentPlayer.maxHealth}
              </span>
            </div>
            <div className="mana-bar">
              <div
                className="mana-fill"
                style={{
                  width: `${(currentPlayer.mana / currentPlayer.maxMana) * 100}%`,
                }}
              />
              <span className="mana-text">
                {currentPlayer.mana} / {currentPlayer.maxMana}
              </span>
            </div>
          </div>

          {/* Player Board */}
          {currentPlayer.board && currentPlayer.board.length > 0 && (
            <div className="creatures">
              {currentPlayer.board.map((creature) => (
                <div key={creature.cardId} className="creature">
                  <div className="name">{creature.name}</div>
                  <div className="stats">
                    {creature.power}/{creature.toughness}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Player Hand */}
          <div className="hand">
            <h4>Hand</h4>
            <div className="cards">
              {currentPlayer.hand.map((card, index) => (
                <div
                  key={index}
                  className={`card ${
                    selectedCard === index ? 'selected' : ''
                  } ${gs.canAct && currentPlayer.mana >= card.cost ? 'playable' : ''}`}
                  onClick={() => setSelectedCard(index)}
                >
                  <div className="name">{card.name}</div>
                  <div className="cost">{card.cost}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="actions">
            <button
              onClick={handlePlayCard}
              disabled={playingCard || selectedCard === null || !gs.canAct}
              className="primary"
            >
              {playingCard ? 'Playing...' : 'Play Card'}
            </button>
            <button
              onClick={() => nextPhase({ variables: { matchId, playerId } })}
              disabled={advancingPhase || !gs.canAct}
            >
              {advancingPhase ? 'Advancing...' : 'End Phase'}
            </button>
            <button
              onClick={() => concedeMatch({ variables: { matchId, playerId } })}
              className="danger"
            >
              Concede
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .active-match {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #1a1a2e;
          color: #eee;
        }

        .match-header {
          padding: 20px;
          border-bottom: 2px solid #e94560;
          background: rgba(0, 0, 0, 0.3);
        }

        .game-stats {
          display: flex;
          gap: 30px;
          margin-top: 10px;
          font-size: 14px;
        }

        .match-content {
          display: flex;
          flex: 1;
          gap: 20px;
          padding: 20px;
          overflow: hidden;
        }

        .opponent-area,
        .player-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 15px;
          border: 1px solid #e94560;
        }

        .player-header {
          margin-bottom: 15px;
        }

        .player-header h3 {
          margin: 0 0 10px 0;
        }

        .health-bar,
        .mana-bar {
          width: 100%;
          height: 30px;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 4px;
          position: relative;
          margin-bottom: 10px;
          overflow: hidden;
        }

        .health-fill {
          height: 100%;
          background: linear-gradient(90deg, #4ecca3, #2a8a6f);
          transition: width 0.3s;
        }

        .mana-fill {
          height: 100%;
          background: linear-gradient(90deg, #bb86fc, #7c5dfa);
          transition: width 0.3s;
        }

        .health-text,
        .mana-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-weight: bold;
          font-size: 12px;
        }

        .creatures {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          gap: 10px;
          margin-bottom: 15px;
        }

        .creature {
          background: linear-gradient(135deg, #2a5f4a 0%, #1a3a2a 100%);
          border: 2px solid #4ecca3;
          border-radius: 4px;
          padding: 8px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .creature:hover {
          transform: scale(1.05);
        }

        .creature .name {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .creature .stats {
          font-size: 14px;
          color: #4ecca3;
          font-weight: bold;
        }

        .hand {
          flex: 1;
          display: flex;
          flex-direction: column;
          margin-bottom: 15px;
        }

        .hand h4 {
          margin: 0 0 10px 0;
        }

        .hand .cards {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          overflow-y: auto;
        }

        .card {
          background: linear-gradient(135deg, #3a2a5a 0%, #2a1a4a 100%);
          border: 2px solid #bb86fc;
          border-radius: 4px;
          padding: 10px;
          min-width: 90px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .card.playable {
          border-color: #4ecca3;
        }

        .card.selected {
          border-color: #fff;
          background: linear-gradient(135deg, #5a3a7a 0%, #4a2a6a 100%);
        }

        .card:hover.playable {
          transform: translateY(-5px);
        }

        .card .name {
          font-size: 11px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .card .cost {
          background: #bb86fc;
          color: #000;
          border-radius: 50%;
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
          font-weight: bold;
          font-size: 12px;
        }

        .actions {
          display: flex;
          gap: 10px;
        }

        button {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        button.primary {
          background: #4ecca3;
          color: #000;
        }

        button.primary:hover:not(:disabled) {
          background: #fff;
        }

        button.danger {
          background: #e94560;
          color: #fff;
        }

        button.danger:hover {
          background: #ff6b7a;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
```

## 5. Using Multiple Subscriptions

```typescript
// components/GameDashboard.tsx
'use client';

import {
  usePlayerGameStateSubscription,
  useCardPlayedSubscription,
  useAttackDeclaredSubscription,
  usePhaseChangedSubscription,
  useMatchCompletedSubscription,
} from '@/hooks/useGraphQL';

export function GameDashboard({ matchId, playerId }: Props) {
  // Main game state
  const { data: gameData } = usePlayerGameStateSubscription(matchId, playerId);

  // Event streams
  const { data: cardData } = useCardPlayedSubscription(matchId);
  const { data: attackData } = useAttackDeclaredSubscription(matchId);
  const { data: phaseData } = usePhaseChangedSubscription(matchId);
  const { data: endData } = useMatchCompletedSubscription(matchId);

  return (
    <div className="dashboard">
      {/* Main board */}
      {gameData?.playerGameStateChanged && (
        <GameBoard state={gameData.playerGameStateChanged} />
      )}

      {/* Event log */}
      <div className="events">
        {cardData?.cardPlayed && (
          <EventLog
            type="card"
            event={cardData.cardPlayed}
          />
        )}
        {attackData?.attackDeclared && (
          <EventLog
            type="attack"
            event={attackData.attackDeclared}
          />
        )}
        {phaseData?.phaseChanged && (
          <EventLog
            type="phase"
            event={phaseData.phaseChanged}
          />
        )}
        {endData?.matchCompleted && (
          <MatchEndNotification result={endData.matchCompleted} />
        )}
      </div>
    </div>
  );
}
```

## Testing GraphQL Operations

```typescript
// __tests__/graphql.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { usePlayer Match, usePlayCard } from '@/hooks/useGraphQL';
import { MockedProvider } from '@apollo/client/testing';

describe('GraphQL Hooks', () => {
  it('fetches player match data', async () => {
    const mocks = [
      {
        request: {
          query: GET_PLAYER_MATCH,
          variables: { matchId: 'match1', playerId: 'player1' },
        },
        result: {
          data: {
            playerMatch: {
              // mock data
            },
          },
        },
      },
    ];

    const { result } = renderHook(() => usePlayerMatch('match1', 'player1'), {
      wrapper: ({ children }) => (
        <MockedProvider mocks={mocks}>{children}</MockedProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
  });
});
```

## Summary

These examples demonstrate:

1. **User Profile** - Basic query and mutation
2. **Leaderboard** - Subscription with real-time updates
3. **Match History** - Query with pagination
4. **Active Match** - Complex component with multiple subscriptions and mutations
5. **Dashboard** - Multiple simultaneous subscriptions
6. **Testing** - Unit testing GraphQL hooks

Adapt these patterns to your specific UI components and requirements.
