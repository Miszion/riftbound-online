import { gql } from '@apollo/client';
import {
  CARD_STATE_FIELDS,
  PLAYER_BOARD_FIELDS,
  PLAYER_STATE_FIELDS,
} from '@/lib/graphql/fragments';

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
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  query GetMatch($matchId: ID!) {
    match(matchId: $matchId) {
      matchId
      winner
      victoryScore
      endReason
      players {
        ...PlayerStateFields
      }
      currentPhase
      turnNumber
      currentPlayerIndex
      status
      timestamp
      moveHistory
      scoreLog {
        playerId
        amount
        reason
        sourceCardId
        timestamp
      }
    }
  }
`;

export const GET_PLAYER_MATCH = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${PLAYER_BOARD_FIELDS}
  query GetPlayerMatch($matchId: ID!, $playerId: ID!) {
    playerMatch(matchId: $matchId, playerId: $playerId) {
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
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
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
          ...PlayerStateFields
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
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
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
          ...PlayerStateFields
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
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
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
          ...PlayerStateFields
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
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  mutation NextPhase($matchId: ID!, $playerId: ID!) {
    nextPhase(matchId: $matchId, playerId: $playerId) {
      success
      gameState {
        matchId
        players {
          ...PlayerStateFields
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

// ============================================================================
// CARD CATALOG & DECKLIST QUERIES
// ============================================================================

export const GET_CARD_CATALOG = gql`
  query CardCatalog($filter: CardCatalogFilter) {
    cardCatalog(filter: $filter) {
      id
      slug
      name
      type
      rarity
      colors
      keywords
      effect
      activation {
        timing
        stateful
      }
      assets {
        remote
        localPath
      }
    }
  }
`;

export const GET_CARD_BY_SLUG = gql`
  query CardBySlug($slug: String!) {
    cardBySlug(slug: $slug) {
      id
      slug
      name
      type
      rarity
      colors
      keywords
      effect
      assets {
        remote
        localPath
      }
    }
  }
`;

export const GET_CARD_BY_ID = gql`
  query CardById($id: ID!) {
    cardById(id: $id) {
      id
      slug
      name
      type
      rarity
      colors
      keywords
      effect
      assets {
        remote
        localPath
      }
    }
  }
`;

export const GET_DECKLISTS = gql`
  query Decklists($userId: ID!) {
    decklists(userId: $userId) {
      deckId
      userId
      name
      description
      heroSlug
      format
      tags
      isPublic
      cardCount
      cards {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      runeDeck {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      battlefields {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      sideDeck {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      championLegend {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      championLeader {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      createdAt
      updatedAt
    }
  }
`;

export const SAVE_DECKLIST = gql`
  mutation SaveDecklist($input: DecklistInput!) {
    saveDecklist(input: $input) {
      deckId
      userId
      name
      description
      heroSlug
      format
      tags
      isPublic
      cardCount
      cards {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      runeDeck {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      battlefields {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      sideDeck {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      championLegend {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      championLeader {
        cardId
        slug
        quantity
        cardSnapshot {
          cardId
          slug
          name
          type
          rarity
          colors
          keywords
          effect
          assets {
            remote
            localPath
          }
        }
      }
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_DECKLIST = gql`
  mutation DeleteDecklist($userId: ID!, $deckId: ID!) {
    deleteDecklist(userId: $userId, deckId: $deckId)
  }
`;

export const GET_MATCHMAKING_STATUS = gql`
  query MatchmakingStatus($userId: ID!, $mode: MatchMode!) {
    matchmakingStatus(userId: $userId, mode: $mode) {
      mode
      state
      queued
      mmr
      queuedAt
      estimatedWaitSeconds
      matchId
      opponentId
    }
  }
`;

export const JOIN_MATCHMAKING_QUEUE = gql`
  mutation JoinMatchmakingQueue($input: MatchmakingQueueInput!) {
    joinMatchmakingQueue(input: $input) {
      mode
      queued
      matchFound
      matchId
      opponentId
      mmr
      estimatedWaitSeconds
    }
  }
`;

export const LEAVE_MATCHMAKING_QUEUE = gql`
  mutation LeaveMatchmakingQueue($userId: ID!, $mode: MatchMode!) {
    leaveMatchmakingQueue(userId: $userId, mode: $mode)
  }
`;

// ============================================================================
// SPECTATOR & REPLAYS
// ============================================================================

export const GET_MATCH_REPLAY = gql`
  query MatchReplay($matchId: ID!) {
    matchReplay(matchId: $matchId) {
      matchId
      players
      winner
      loser
      duration
      turns
      moves
      finalState
      createdAt
    }
  }
`;

export const GET_RECENT_MATCHES = gql`
  query RecentMatches($limit: Int) {
    recentMatches(limit: $limit) {
      matchId
      players
      winner
      loser
      duration
      turns
      createdAt
    }
  }
`;
