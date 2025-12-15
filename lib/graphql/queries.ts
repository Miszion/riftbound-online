import { gql } from '@apollo/client';

// ============================================================================
// USER QUERIES
// ============================================================================

export const GET_USER = gql`
  query GetUser($userId: ID!) {
    user(userId: $userId) {
      userId
      username
      email
      userLevel
      wins
      totalMatches
      lastLogin
      createdAt
    }
  }
`;

export const GET_LEADERBOARD = gql`
  query GetLeaderboard($limit: Int) {
    leaderboard(limit: $limit) {
      userId
      username
      wins
      totalMatches
      winRate
    }
  }
`;

// ============================================================================
// MATCH QUERIES
// ============================================================================

export const GET_MATCH = gql`
  query GetMatch($matchId: ID!) {
    match(matchId: $matchId) {
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
      currentPhase
      turnNumber
      currentPlayerIndex
      status
      timestamp
    }
  }
`;

export const GET_PLAYER_MATCH = gql`
  query GetPlayerMatch($matchId: ID!, $playerId: ID!) {
    playerMatch(matchId: $matchId, playerId: $playerId) {
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

export const GET_MATCH_HISTORY = gql`
  query GetMatchHistory($userId: ID!, $limit: Int) {
    matchHistory(userId: $userId, limit: $limit) {
      matchId
      timestamp
      players
      winner
      loser
      duration
      turns
      moveCount
      status
    }
  }
`;

export const GET_MATCH_RESULT = gql`
  query GetMatchResult($matchId: ID!) {
    matchResult(matchId: $matchId) {
      matchId
      winner
      loser
      reason
      duration
      turns
      moves
    }
  }
`;

// ============================================================================
// USER MUTATIONS
// ============================================================================

export const UPDATE_USER = gql`
  mutation UpdateUser(
    $userId: ID!
    $username: String
    $userLevel: Int
    $wins: Int
    $totalMatches: Int
  ) {
    updateUser(
      userId: $userId
      username: $username
      userLevel: $userLevel
      wins: $wins
      totalMatches: $totalMatches
    ) {
      userId
      username
      email
      userLevel
      wins
      totalMatches
      lastLogin
      createdAt
    }
  }
`;

// ============================================================================
// MATCH MUTATIONS
// ============================================================================

export const INIT_MATCH = gql`
  mutation InitMatch(
    $matchId: ID!
    $player1: ID!
    $player2: ID!
    $decks: JSON!
  ) {
    initMatch(
      matchId: $matchId
      player1: $player1
      player2: $player2
      decks: $decks
    ) {
      matchId
      status
      players
      gameState {
        matchId
        players {
          playerId
          health
          maxHealth
          mana
          maxMana
        }
        currentPhase
        turnNumber
        currentPlayerIndex
        status
      }
    }
  }
`;

export const PLAY_CARD = gql`
  mutation PlayCard(
    $matchId: ID!
    $playerId: ID!
    $cardIndex: Int!
    $targets: [String!]
  ) {
    playCard(
      matchId: $matchId
      playerId: $playerId
      cardIndex: $cardIndex
      targets: $targets
    ) {
      success
      gameState {
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
      }
      currentPhase
    }
  }
`;

export const ATTACK = gql`
  mutation Attack(
    $matchId: ID!
    $playerId: ID!
    $creatureInstanceId: String!
    $defenderId: String
  ) {
    attack(
      matchId: $matchId
      playerId: $playerId
      creatureInstanceId: $creatureInstanceId
      defenderId: $defenderId
    ) {
      success
      gameState {
        matchId
        players {
          playerId
          health
          maxHealth
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
      }
      currentPhase
    }
  }
`;

export const NEXT_PHASE = gql`
  mutation NextPhase($matchId: ID!, $playerId: ID!) {
    nextPhase(matchId: $matchId, playerId: $playerId) {
      success
      gameState {
        matchId
        players {
          playerId
          health
          mana
          maxMana
          hand {
            cardId
          }
        }
        currentPhase
        turnNumber
        currentPlayerIndex
        status
      }
      currentPhase
    }
  }
`;

export const REPORT_MATCH_RESULT = gql`
  mutation ReportMatchResult(
    $matchId: ID!
    $winner: ID!
    $reason: String!
  ) {
    reportMatchResult(
      matchId: $matchId
      winner: $winner
      reason: $reason
    ) {
      success
      matchResult {
        matchId
        winner
        loser
        reason
        duration
        turns
        moves
      }
    }
  }
`;

export const CONCEDE_MATCH = gql`
  mutation ConcedeMatch($matchId: ID!, $playerId: ID!) {
    concedeMatch(matchId: $matchId, playerId: $playerId) {
      success
      matchResult {
        matchId
        winner
        loser
        reason
        duration
        turns
      }
    }
  }
`;
