import { gql } from '@apollo/client';
import {
  CARD_STATE_FIELDS,
  CARD_SNAPSHOT_FIELDS,
  PLAYER_BOARD_FIELDS,
  PLAYER_STATE_FIELDS,
  BATTLEFIELD_STATE_FIELDS,
  GAME_PROMPT_FIELDS,
  PRIORITY_WINDOW_FIELDS,
  MATCHMAKING_STATUS_FIELDS,
} from '@/lib/graphql/fragments';

// ============================================================================
// MATCH SUBSCRIPTIONS
// ============================================================================

export const GAME_STATE_CHANGED = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${CARD_SNAPSHOT_FIELDS}
  ${BATTLEFIELD_STATE_FIELDS}
  ${GAME_PROMPT_FIELDS}
  ${PRIORITY_WINDOW_FIELDS}
  subscription GameStateChanged($matchId: ID!) {
    gameStateChanged(matchId: $matchId) {
      matchId
      winner
      endReason
      players {
        ...PlayerStateFields
      }
      currentPhase
      turnNumber
      currentPlayerIndex
      status
      timestamp
      initiativeWinner
      initiativeLoser
      initiativeSelections
      initiativeDecidedAt
      scoreLog {
        playerId
        amount
        reason
        sourceCardId
        timestamp
      }
      prompts {
        ...GamePromptFields
      }
      priorityWindow {
        ...PriorityWindowFields
      }
      battlefields {
        ...BattlefieldStateFields
      }
    }
  }
`;

export const PLAYER_GAME_STATE_CHANGED = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${PLAYER_BOARD_FIELDS}
  subscription PlayerGameStateChanged($matchId: ID!, $playerId: ID!) {
    playerGameStateChanged(matchId: $matchId, playerId: $playerId) {
      matchId
      currentPlayer {
        ...PlayerStateFields
      }
      opponent {
        playerId
        victoryPoints
        victoryScore
        handSize
        board {
          ...PlayerBoardStateFields
        }
      }
      gameState {
        matchId
        currentPhase
        turnNumber
        currentPlayerIndex
        canAct
      }
    }
  }
`;

export const MATCH_COMPLETED = gql`
  subscription MatchCompleted($matchId: ID!) {
    matchCompleted(matchId: $matchId) {
      matchId
      winner
      loser
      reason
      duration
      turns
    }
  }
`;

export const LEADERBOARD_UPDATED = gql`
  subscription LeaderboardUpdated {
    leaderboardUpdated {
      userId
      username
      wins
      totalMatches
      winRate
    }
  }
`;

// ============================================================================
// REAL-TIME GAME EVENT SUBSCRIPTIONS
// ============================================================================

export const CARD_PLAYED = gql`
  subscription CardPlayed($matchId: ID!) {
    cardPlayed(matchId: $matchId) {
      matchId
      playerId
      card {
        cardId
        name
        cost
        power
        toughness
        type
      }
      timestamp
    }
  }
`;

export const ATTACK_DECLARED = gql`
  subscription AttackDeclared($matchId: ID!) {
    attackDeclared(matchId: $matchId) {
      matchId
      playerId
      creatureInstanceId
      destinationId
      timestamp
    }
  }
`;

export const PHASE_CHANGED = gql`
  subscription PhaseChanged($matchId: ID!) {
    phaseChanged(matchId: $matchId) {
      matchId
      newPhase
      turnNumber
      timestamp
    }
  }
`;

export const MATCHMAKING_STATUS_UPDATED = gql`
  ${MATCHMAKING_STATUS_FIELDS}
  subscription MatchmakingStatusUpdated($userId: ID!, $mode: MatchMode!) {
    matchmakingStatusUpdated(userId: $userId, mode: $mode) {
      ...MatchmakingStatusFields
    }
  }
`;
