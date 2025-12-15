import { gql } from '@apollo/client';

// ============================================================================
// MATCH SUBSCRIPTIONS
// ============================================================================

export const GAME_STATE_CHANGED = gql`
  subscription GameStateChanged($matchId: ID!) {
    gameStateChanged(matchId: $matchId) {
      matchId
      players {
        playerId
        health
        maxHealth
        mana
        maxMana
        hand {
          cardId
          name
          cost
        }
        board {
          cardId
          name
          power
          toughness
        }
      }
      currentPhase
      turnNumber
      currentPlayerIndex
      status
      timestamp
    }
  }
`;

export const PLAYER_GAME_STATE_CHANGED = gql`
  subscription PlayerGameStateChanged($matchId: ID!, $playerId: ID!) {
    playerGameStateChanged(matchId: $matchId, playerId: $playerId) {
      matchId
      currentPlayer {
        playerId
        health
        maxHealth
        mana
        maxMana
        hand {
          cardId
          name
          cost
          power
          toughness
          type
        }
        board {
          cardId
          name
          cost
          power
          toughness
          type
        }
      }
      opponent {
        playerId
        health
        handSize
        board {
          cardId
          name
          cost
          power
          toughness
          type
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
      defenderId
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
