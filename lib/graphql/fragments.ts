import { gql } from '@apollo/client'

export const CARD_STATE_FIELDS = gql`
  fragment CardStateFields on Card {
    cardId
    instanceId
    name
    type
    rarity
    cost
    powerCost
    power
    toughness
    currentToughness
    keywords
    tags
    abilities
    text
    isTapped
    summoned
    counters
    metadata
    assets {
      remote
      localPath
    }
    location {
      zone
      battlefieldId
    }
    activationState {
      cardId
      isStateful
      active
      lastChangedAt
      history {
        at
        reason
        active
      }
    }
  }
`

export const CARD_SNAPSHOT_FIELDS = gql`
  fragment CardSnapshotFields on CardSnapshot {
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
    isTapped
  }
`

export const PLAYER_BOARD_FIELDS = gql`
  ${CARD_STATE_FIELDS}
  fragment PlayerBoardStateFields on PlayerBoardState {
    creatures {
      ...CardStateFields
    }
    artifacts {
      ...CardStateFields
    }
    enchantments {
      ...CardStateFields
    }
  }
`

export const PLAYER_STATE_FIELDS = gql`
  ${CARD_STATE_FIELDS}
  ${PLAYER_BOARD_FIELDS}
  ${CARD_SNAPSHOT_FIELDS}
  fragment PlayerStateFields on PlayerState {
    playerId
    name
    victoryPoints
    victoryScore
    mana
    maxMana
    handSize
    deckCount
    runeDeckSize
    hand {
      ...CardStateFields
    }
    board {
      ...PlayerBoardStateFields
    }
    graveyard {
      ...CardStateFields
    }
    exile {
      ...CardStateFields
    }
    channeledRunes {
      runeId
      name
      domain
      energyValue
      powerValue
      slug
      assets {
        remote
        localPath
      }
      isTapped
      cardSnapshot {
        ...CardSnapshotFields
      }
    }
    runeDeck {
      runeId
      name
      domain
      energyValue
      powerValue
      slug
      assets {
        remote
        localPath
      }
      isTapped
      cardSnapshot {
        ...CardSnapshotFields
      }
    }
    resources {
      energy
      universalPower
      power
    }
    temporaryEffects {
      id
      affectedCards
      affectedPlayer
      duration
      effect {
        type
        value
      }
    }
    championLegend {
      ...CardSnapshotFields
    }
    championLeader {
      ...CardSnapshotFields
    }
    championLegendState {
      canActivate
      hasManualActivation
      reason
      costSummary
      cost {
        energy
        runes
        exhausts
      }
    }
    championLeaderState {
      canActivate
      hasManualActivation
      reason
      costSummary
      cost {
        energy
        runes
        exhausts
      }
    }
  }
`

export const BATTLEFIELD_STATE_FIELDS = gql`
  ${CARD_SNAPSHOT_FIELDS}
  fragment BattlefieldStateFields on BattlefieldState {
    battlefieldId
    slug
    name
    ownerId
    controller
    contestedBy
    lastConqueredTurn
    lastHoldTurn
    lastCombatTurn
    lastHoldScoreTurn
    combatTurnByPlayer
    effectState
    presence {
      playerId
      totalMight
      unitCount
    }
    card {
      ...CardSnapshotFields
    }
  }
`

export const GAME_PROMPT_FIELDS = gql`
  fragment GamePromptFields on GamePrompt {
    id
    type
    playerId
    data
    resolved
    createdAt
    resolvedAt
    resolution
  }
`

export const PRIORITY_WINDOW_FIELDS = gql`
  fragment PriorityWindowFields on PriorityWindow {
    id
    type
    holder
    openedAt
    expiresAt
    event
  }
`

export const MATCHMAKING_STATUS_FIELDS = gql`
  fragment MatchmakingStatusFields on MatchmakingStatus {
    mode
    state
    queued
    mmr
    queuedAt
    estimatedWaitSeconds
    matchId
    opponentId
    opponentName
  }
`
