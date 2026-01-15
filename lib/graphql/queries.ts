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
  REACTION_CHAIN_FIELDS,
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
  ${CARD_SNAPSHOT_FIELDS}
  ${BATTLEFIELD_STATE_FIELDS}
  ${GAME_PROMPT_FIELDS}
  ${PRIORITY_WINDOW_FIELDS}
  ${REACTION_CHAIN_FIELDS}
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
      initiativeWinner
      initiativeLoser
      initiativeSelections
      initiativeDecidedAt
      moveHistory
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
      duelLog {
        id
        message
        tone
        playerId
        actorName
        timestamp
      }
      chatLog {
        id
        playerId
        playerName
        message
        timestamp
      }
      focusPlayerId
      combatContext {
        battlefieldId
        initiatedBy
        defendingPlayerId
        attackingUnitIds
        defendingUnitIds
        priorityStage
      }
      pendingSpellResolution {
        id
        spell {
          ...CardStateFields
        }
        casterId
        targets
        targetDescriptions
        createdAt
        reactorId
        resolved
      }
      reactionChain {
        ...ReactionChainFields
      }
    }
  }
`;

export const GET_PLAYER_MATCH = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${PLAYER_BOARD_FIELDS}
  ${CARD_SNAPSHOT_FIELDS}
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
        runeDeckSize
        board {
          ...PlayerBoardStateFields
        }
        championLegend {
          ...CardSnapshotFields
        }
        championLeader {
          ...CardSnapshotFields
        }
      }
      gameState {
        matchId
        currentPhase
        turnNumber
        currentPlayerIndex
        canAct
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
      }
    }
  }
`;

export const SUBMIT_INITIATIVE_CHOICE = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${CARD_SNAPSHOT_FIELDS}
  ${BATTLEFIELD_STATE_FIELDS}
  ${GAME_PROMPT_FIELDS}
  ${PRIORITY_WINDOW_FIELDS}
  mutation SubmitInitiativeChoice(
    $matchId: ID!
    $playerId: ID!
    $choice: Int!
  ) {
    submitInitiativeChoice(matchId: $matchId, playerId: $playerId, choice: $choice) {
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
      prompts {
        ...GamePromptFields
      }
      priorityWindow {
        ...PriorityWindowFields
      }
      battlefields {
        ...BattlefieldStateFields
      }
      focusPlayerId
      combatContext {
        battlefieldId
        initiatedBy
        defendingPlayerId
        attackingUnitIds
        defendingUnitIds
        priorityStage
      }
    }
  }
`;

export const SUBMIT_MULLIGAN = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${CARD_SNAPSHOT_FIELDS}
  ${BATTLEFIELD_STATE_FIELDS}
  ${GAME_PROMPT_FIELDS}
  ${PRIORITY_WINDOW_FIELDS}
  mutation SubmitMulligan($matchId: ID!, $playerId: ID!, $indices: [Int!]) {
    submitMulligan(matchId: $matchId, playerId: $playerId, indices: $indices) {
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
      prompts {
        ...GamePromptFields
      }
      priorityWindow {
        ...PriorityWindowFields
      }
      battlefields {
        ...BattlefieldStateFields
      }
      focusPlayerId
      combatContext {
        battlefieldId
        initiatedBy
        defendingPlayerId
        attackingUnitIds
        defendingUnitIds
        priorityStage
      }
    }
  }
`;


export const SUBMIT_DISCARD_SELECTION = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${CARD_SNAPSHOT_FIELDS}
  ${BATTLEFIELD_STATE_FIELDS}
  ${GAME_PROMPT_FIELDS}
  ${PRIORITY_WINDOW_FIELDS}
  mutation SubmitDiscardSelection(
    $matchId: ID!
    $playerId: ID!
    $promptId: ID!
    $cardInstanceIds: [ID!]!
  ) {
    submitDiscardSelection(
      matchId: $matchId
      playerId: $playerId
      promptId: $promptId
      cardInstanceIds: $cardInstanceIds
    ) {
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
      prompts {
        ...GamePromptFields
      }
      priorityWindow {
        ...PriorityWindowFields
      }
      battlefields {
        ...BattlefieldStateFields
      }
      focusPlayerId
      combatContext {
        battlefieldId
        initiatedBy
        defendingPlayerId
        attackingUnitIds
        defendingUnitIds
        priorityStage
      }
    }
  }
`;

export const SUBMIT_TARGET_SELECTION = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${CARD_SNAPSHOT_FIELDS}
  ${BATTLEFIELD_STATE_FIELDS}
  ${GAME_PROMPT_FIELDS}
  ${PRIORITY_WINDOW_FIELDS}
  mutation SubmitTargetSelection(
    $matchId: ID!
    $playerId: ID!
    $promptId: ID!
    $selectionIds: [ID!]!
  ) {
    submitTargetSelection(
      matchId: $matchId
      playerId: $playerId
      promptId: $promptId
      selectionIds: $selectionIds
    ) {
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
      prompts {
        ...GamePromptFields
      }
      priorityWindow {
        ...PriorityWindowFields
      }
      battlefields {
        ...BattlefieldStateFields
      }
      focusPlayerId
      combatContext {
        battlefieldId
        initiatedBy
        defendingPlayerId
        attackingUnitIds
        defendingUnitIds
        priorityStage
      }
    }
  }
`;

export const SELECT_BATTLEFIELD = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${CARD_SNAPSHOT_FIELDS}
  ${BATTLEFIELD_STATE_FIELDS}
  ${GAME_PROMPT_FIELDS}
  ${PRIORITY_WINDOW_FIELDS}
  mutation SelectBattlefield($matchId: ID!, $playerId: ID!, $battlefieldId: ID!) {
    selectBattlefield(
      matchId: $matchId
      playerId: $playerId
      battlefieldId: $battlefieldId
    ) {
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
      prompts {
        ...GamePromptFields
      }
      priorityWindow {
        ...PriorityWindowFields
      }
      battlefields {
        ...BattlefieldStateFields
      }
      focusPlayerId
      combatContext {
        battlefieldId
        initiatedBy
        defendingPlayerId
        attackingUnitIds
        defendingUnitIds
        priorityStage
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
    $destinationId: String
    $useAccelerate: Boolean
  ) {
    playCard(
      matchId: $matchId
      playerId: $playerId
      cardIndex: $cardIndex
      targets: $targets
      destinationId: $destinationId
      useAccelerate: $useAccelerate
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
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
    $destinationId: String!
  ) {
    attack(
      matchId: $matchId
      playerId: $playerId
      creatureInstanceId: $creatureInstanceId
      destinationId: $destinationId
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
      }
      currentPhase
    }
  }
`;

export const MOVE_UNIT = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  mutation MoveUnit(
    $matchId: ID!
    $playerId: ID!
    $creatureInstanceId: String!
    $destinationId: String!
  ) {
    moveUnit(
      matchId: $matchId
      playerId: $playerId
      creatureInstanceId: $creatureInstanceId
      destinationId: $destinationId
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
      }
      currentPhase
    }
  }
`;

export const ACTIVATE_CHAMPION_POWER = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  mutation ActivateChampionAbility(
    $matchId: ID!
    $playerId: ID!
    $target: String
    $destinationId: String
  ) {
    activateChampionAbility(
      matchId: $matchId
      playerId: $playerId
      target: $target
      destinationId: $destinationId
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
      }
      currentPhase
    }
  }
`;

export const COMMENCE_BATTLE = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  mutation CommenceBattle($matchId: ID!, $playerId: ID!, $battlefieldId: ID!) {
    commenceBattle(matchId: $matchId, playerId: $playerId, battlefieldId: $battlefieldId) {
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
      }
      currentPhase
    }
  }
`;

export const RECORD_DUEL_LOG_ENTRY = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  mutation RecordDuelLogEntry(
    $matchId: ID!
    $playerId: ID!
    $message: String!
    $tone: String
    $entryId: ID
    $actorName: String
  ) {
    recordDuelLogEntry(
      matchId: $matchId
      playerId: $playerId
      message: $message
      tone: $tone
      entryId: $entryId
      actorName: $actorName
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
        duelLog {
          id
          message
          tone
          playerId
          actorName
          timestamp
        }
      }
      currentPhase
    }
  }
`;

export const SEND_CHAT_MESSAGE = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  mutation SendChatMessage($matchId: ID!, $playerId: ID!, $message: String!) {
    sendChatMessage(matchId: $matchId, playerId: $playerId, message: $message) {
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
        chatLog {
          id
          playerId
          playerName
          message
          timestamp
        }
      }
      currentPhase
    }
  }
`;

export const PASS_PRIORITY = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  mutation PassPriority($matchId: ID!, $playerId: ID!) {
    passPriority(matchId: $matchId, playerId: $playerId) {
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
        focusPlayerId
        combatContext {
          battlefieldId
          initiatedBy
          defendingPlayerId
          attackingUnitIds
          defendingUnitIds
          priorityStage
        }
      }
      currentPhase
    }
  }
`;

export const RESPOND_TO_SPELL_REACTION = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  mutation RespondToSpellReaction($matchId: ID!, $playerId: ID!, $pass: Boolean!) {
    respondToSpellReaction(matchId: $matchId, playerId: $playerId, pass: $pass) {
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
        focusPlayerId
        pendingSpellResolution {
          id
          spell {
            ...CardStateFields
          }
          casterId
          targets
          targetDescriptions
          createdAt
          reactorId
          resolved
        }
      }
      currentPhase
    }
  }
`;

export const RESPOND_TO_CHAIN_REACTION = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_STATE_FIELDS}
  ${REACTION_CHAIN_FIELDS}
  mutation RespondToChainReaction($matchId: ID!, $playerId: ID!, $pass: Boolean!) {
    respondToChainReaction(matchId: $matchId, playerId: $playerId, pass: $pass) {
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
        focusPlayerId
        reactionChain {
          ...ReactionChainFields
        }
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
      gameState {
        matchId
        status
        winner
        endReason
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
      gameState {
        matchId
        status
        winner
        endReason
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
      isDefault
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
      isDefault
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
  ${MATCHMAKING_STATUS_FIELDS}
  query MatchmakingStatus($userId: ID!, $mode: MatchMode!) {
    matchmakingStatus(userId: $userId, mode: $mode) {
      ...MatchmakingStatusFields
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
      opponentName
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
