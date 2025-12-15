import { gql } from '@apollo/client'

export const CARD_STATE_FIELDS = gql`
  fragment CardStateFields on Card {
    cardId
    instanceId
    name
    type
    rarity
    cost
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
    assets {
      remote
      localPath
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
    }
    runeDeck {
      runeId
      name
      domain
      energyValue
      powerValue
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
  }
`
