'use client';

import React from 'react';
import {
  usePlayerGameStateSubscription,
  usePlayCard,
  useNextPhase,
  useConcedeMatch,
} from '@/hooks/useGraphQL';

interface GameBoardProps {
  matchId: string;
  playerId: string;
}

type CardInstance = {
  cardId: string;
  name: string;
  power: number;
  toughness: number;
  cost?: number;
  type?: string;
};

type PlayerDetails = {
  playerId: string;
  victoryPoints: number;
  victoryScore?: number;
  mana?: number;
  maxMana?: number;
  hand?: CardInstance[] | null;
  board?: CardInstance[] | null;
  handSize?: number;
};

type FlowState = {
  matchId: string;
  currentPhase: string;
  turnNumber: number;
  currentPlayerIndex: number;
  canAct: boolean;
};

type PlayerGameState = {
  matchId: string;
  currentPlayer: PlayerDetails;
  opponent: PlayerDetails;
  gameState: FlowState;
};

/**
 * Example game board component showing real-time updates using GraphQL subscriptions
 * This demonstrates how to use the custom hooks for:
 * - Real-time game state updates via subscription
 * - Card play mutations
 * - Phase advancement mutations
 * - Match concession
 */
export function GameBoard({ matchId, playerId }: GameBoardProps) {
  // Subscribe to real-time game state changes
  const { data: gameData, loading: gameLoading, error: gameError } =
    usePlayerGameStateSubscription(matchId, playerId);

  // Setup mutations for player actions
  const [playCard, { loading: playingCard }] = usePlayCard();
  const [nextPhase, { loading: advancingPhase }] = useNextPhase();
  const [concedeMatch] = useConcedeMatch();

  const gameState = gameData?.playerGameStateChanged as
    | PlayerGameState
    | undefined;

  // Handle card play
  const handlePlayCard = async (cardIndex: number) => {
    try {
      const result = await playCard({
        variables: {
          matchId,
          playerId,
          cardIndex,
        },
      });

      console.log('Card played:', result.data);
      // Real-time update will come through subscription
    } catch (error) {
      console.error('Failed to play card:', error);
    }
  };

  // Handle phase advancement
  const handleNextPhase = async () => {
    try {
      const result = await nextPhase({
        variables: {
          matchId,
          playerId,
        },
      });

      console.log('Phase advanced:', result.data);
    } catch (error) {
      console.error('Failed to advance phase:', error);
    }
  };

  // Handle match concession
  const handleConcede = async () => {
    if (confirm('Are you sure you want to concede?')) {
      try {
        const result = await concedeMatch({
          variables: {
            matchId,
            playerId,
          },
        });

        console.log('Match conceded:', result.data);
      } catch (error) {
        console.error('Failed to concede:', error);
      }
    }
  };

  if (gameLoading) return <div>Loading game state...</div>;
  if (gameError) return <div>Error loading game: {gameError.message}</div>;
  if (!gameState) return <div>No game data available</div>;

  const { currentPlayer, opponent, gameState: gs } = gameState;
  const opponentBoard: CardInstance[] = opponent.board ?? [];
  const opponentHandSize = opponent.handSize ?? opponentBoard.length;
  const playerBoard: CardInstance[] = currentPlayer.board ?? [];
  const playerHand: CardInstance[] = currentPlayer.hand ?? [];
  const opponentScoreCap = opponent.victoryScore ?? currentPlayer.victoryScore ?? 8;
  const playerVictoryScore = currentPlayer.victoryScore ?? opponentScoreCap ?? 8;
  const playerMaxMana = currentPlayer.maxMana ?? currentPlayer.mana ?? 0;
  const playerMana = currentPlayer.mana ?? 0;

  return (
    <div className="game-board">
      <div className="game-header">
        <h1>Match: {matchId}</h1>
        <div className="game-info">
          <span>Phase: {gs.currentPhase}</span>
          <span>Turn: {gs.turnNumber}</span>
        </div>
      </div>

      <div className="game-container">
        {/* Opponent Section */}
        <div className="opponent-section">
          <h2>Opponent</h2>
          <div className="opponent-stats">
            <div className="health">
              Score:{' '}
              <span className="value">
                {opponent.victoryPoints}/{opponentScoreCap ?? 8}
              </span>
            </div>
            <div className="hand-size">
              Hand: <span className="value">{opponentHandSize}</span>
            </div>
          </div>
          <div className="opponent-board">
            <h3>Creatures</h3>
            {opponentBoard.length > 0 ? (
              <div className="creatures">
                {opponentBoard.map((creature) => (
                  <div key={creature.cardId} className="creature-card">
                    <div className="name">{creature.name}</div>
                    <div className="stats">
                      {creature.power}/{creature.toughness}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">No creatures</div>
            )}
          </div>
        </div>

        {/* Current Player Section */}
        <div className="player-section">
          <h2>Your Turn: {gs.canAct ? 'Active' : 'Inactive'}</h2>

          {/* Player Stats */}
          <div className="player-stats">
            <div className="health">
              Score:{' '}
              <span className="value">
                {currentPlayer.victoryPoints}/{playerVictoryScore ?? 8}
              </span>
            </div>
            <div className="mana">
              Mana:{' '}
              <span className="value">
                {playerMana}/{playerMaxMana}
              </span>
            </div>
          </div>

          {/* Player Board */}
          <div className="player-board">
            <h3>Your Creatures</h3>
            {playerBoard.length > 0 ? (
              <div className="creatures">
                {playerBoard.map((creature) => (
                  <div key={creature.cardId} className="creature-card">
                    <div className="name">{creature.name}</div>
                    <div className="stats">
                      {creature.power}/{creature.toughness}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">No creatures</div>
            )}
          </div>

          {/* Player Hand */}
          <div className="player-hand">
            <h3>Hand ({playerHand.length} cards)</h3>
            {playerHand.length > 0 ? (
              <div className="hand-cards">
                {playerHand.map((card, index) => (
                  <div
                    key={index}
                    className="hand-card"
                    onClick={() => handlePlayCard(index)}
                  >
                    <div className="name">{card.name}</div>
                    <div className="cost">{card.cost ?? 0}</div>
                    <button
                      disabled={
                        playingCard ||
                        !gs.canAct ||
                        playerMana < (card.cost ?? 0)
                      }
                    >
                      Play
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">No cards in hand</div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              onClick={handleNextPhase}
              disabled={advancingPhase || !gs.canAct}
              className="primary"
            >
              {advancingPhase ? 'Advancing...' : 'End Phase'}
            </button>
            <button onClick={handleConcede} className="danger">
              Concede
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .game-board {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          color: #eee;
          font-family: Arial, sans-serif;
        }

        .game-header {
          padding: 20px;
          border-bottom: 2px solid #e94560;
          background: rgba(0, 0, 0, 0.3);
        }

        .game-info {
          display: flex;
          gap: 30px;
          margin-top: 10px;
          font-size: 16px;
        }

        .game-container {
          display: flex;
          flex: 1;
          gap: 20px;
          padding: 20px;
          overflow: hidden;
        }

        .opponent-section,
        .player-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 15px;
          border: 1px solid #e94560;
        }

        .opponent-stats,
        .player-stats {
          display: flex;
          gap: 20px;
          margin: 10px 0;
          padding: 10px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
        }

        .health,
        .mana,
        .hand-size {
          font-weight: bold;
        }

        .value {
          color: #4ecca3;
          font-size: 18px;
        }

        .opponent-board,
        .player-board,
        .player-hand {
          flex: 1;
          overflow-y: auto;
          margin: 10px 0;
          padding: 10px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }

        h3 {
          margin: 0 0 10px 0;
          font-size: 14px;
        }

        .creatures {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          gap: 10px;
        }

        .creature-card {
          background: linear-gradient(135deg, #2a5f4a 0%, #1a3a2a 100%);
          border: 2px solid #4ecca3;
          border-radius: 4px;
          padding: 8px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .creature-card:hover {
          transform: scale(1.05);
          border-color: #fff;
        }

        .creature-card .name {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .creature-card .stats {
          font-size: 14px;
          color: #4ecca3;
          font-weight: bold;
        }

        .hand-cards {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .hand-card {
          background: linear-gradient(135deg, #3a2a5a 0%, #2a1a4a 100%);
          border: 2px solid #bb86fc;
          border-radius: 4px;
          padding: 10px;
          min-width: 100px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .hand-card:hover {
          transform: translateY(-10px);
          border-color: #fff;
        }

        .hand-card .name {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .hand-card .cost {
          background: #bb86fc;
          color: #000;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 5px;
          font-weight: bold;
        }

        .hand-card button {
          width: 100%;
          padding: 5px;
          margin-top: 5px;
          background: #bb86fc;
          color: #000;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }

        .hand-card button:hover:not(:disabled) {
          background: #fff;
        }

        .hand-card button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-buttons {
          display: flex;
          gap: 10px;
          margin-top: 15px;
        }

        button {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .primary {
          background: #4ecca3;
          color: #000;
        }

        .primary:hover:not(:disabled) {
          background: #fff;
        }

        .danger {
          background: #e94560;
          color: #fff;
        }

        .danger:hover {
          background: #ff6b7a;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .empty {
          text-align: center;
          padding: 20px;
          color: #999;
        }
      `}</style>
    </div>
  );
}

export default GameBoard;
