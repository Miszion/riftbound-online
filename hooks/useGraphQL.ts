import { useMemo } from 'react';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import {
  GET_USER,
  GET_LEADERBOARD,
  GET_MATCH,
  GET_PLAYER_MATCH,
  GET_MATCH_HISTORY,
  GET_MATCH_RESULT,
  UPDATE_USER,
  INIT_MATCH,
  PLAY_CARD,
  ATTACK,
  MOVE_UNIT,
  COMMENCE_BATTLE,
  NEXT_PHASE,
  RECORD_DUEL_LOG_ENTRY,
  SEND_CHAT_MESSAGE,
  REPORT_MATCH_RESULT,
  CONCEDE_MATCH,
  PASS_PRIORITY,
  RESPOND_TO_SPELL_REACTION,
  RESPOND_TO_CHAIN_REACTION,
  ACTIVATE_CHAMPION_POWER,
  GET_CARD_CATALOG,
  GET_DECKLISTS,
  SAVE_DECKLIST,
  DELETE_DECKLIST,
  GET_MATCHMAKING_STATUS,
  JOIN_MATCHMAKING_QUEUE,
  LEAVE_MATCHMAKING_QUEUE,
  GET_MATCH_REPLAY,
  GET_RECENT_MATCHES,
  SUBMIT_MULLIGAN,
  SUBMIT_DISCARD_SELECTION,
  SUBMIT_TARGET_SELECTION,
  SELECT_BATTLEFIELD,
  SUBMIT_INITIATIVE_CHOICE,
} from '@/lib/graphql/queries';
import {
  GAME_STATE_CHANGED,
  PLAYER_GAME_STATE_CHANGED,
  MATCH_COMPLETED,
  LEADERBOARD_UPDATED,
  CARD_PLAYED,
  ATTACK_DECLARED,
  PHASE_CHANGED,
  MATCHMAKING_STATUS_UPDATED,
} from '@/lib/graphql/subscriptions';

// ============================================================================
// USER HOOKS
// ============================================================================

export function useUser(userId: string | null) {
  return useQuery(GET_USER, {
    variables: { userId: userId || '' },
    skip: !userId,
  });
}

export function useLeaderboard(limit?: number) {
  return useQuery(GET_LEADERBOARD, {
    variables: { limit },
  });
}

export function useUpdateUser() {
  return useMutation(UPDATE_USER);
}

// ============================================================================
// MATCH QUERY HOOKS
// ============================================================================

export function useMatch(matchId: string | null) {
  return useQuery(GET_MATCH, {
    variables: { matchId: matchId || '' },
    skip: !matchId,
    context: { skipNetworkActivity: true },
  });
}

export function usePlayerMatch(matchId: string | null, playerId: string | null) {
  return useQuery(GET_PLAYER_MATCH, {
    variables: { matchId: matchId || '', playerId: playerId || '' },
    skip: !matchId || !playerId,
    context: { skipNetworkActivity: true },
  });
}

export function useMatchHistory(userId: string | null, limit?: number) {
  return useQuery(GET_MATCH_HISTORY, {
    variables: { userId: userId || '', limit },
    skip: !userId,
    context: { skipNetworkActivity: true },
  });
}

export function useMatchResult(matchId: string | null) {
  return useQuery(GET_MATCH_RESULT, {
    variables: { matchId: matchId || '' },
    skip: !matchId,
    context: { skipNetworkActivity: true },
  });
}

// ============================================================================
// MATCH MUTATION HOOKS
// ============================================================================

export function useInitMatch() {
  return useMutation(INIT_MATCH);
}

export function useSubmitInitiativeChoice() {
  return useMutation(SUBMIT_INITIATIVE_CHOICE);
}

export function useSubmitMulligan() {
  return useMutation(SUBMIT_MULLIGAN);
}

export function useSubmitDiscardSelection() {
  return useMutation(SUBMIT_DISCARD_SELECTION);
}

export function useSubmitTargetSelection() {
  return useMutation(SUBMIT_TARGET_SELECTION);
}

export function useSelectBattlefield() {
  return useMutation(SELECT_BATTLEFIELD);
}

export function usePlayCard() {
  return useMutation(PLAY_CARD);
}

export function useAttack() {
  return useMutation(ATTACK);
}

export function useMoveUnit() {
  return useMutation(MOVE_UNIT);
}

export function useCommenceBattle() {
  return useMutation(COMMENCE_BATTLE);
}

export function useNextPhase() {
  return useMutation(NEXT_PHASE);
}

export function useActivateChampionPower() {
  return useMutation(ACTIVATE_CHAMPION_POWER);
}

export function useRecordDuelLogEntry() {
  return useMutation(RECORD_DUEL_LOG_ENTRY);
}

export function useSendChatMessage() {
  return useMutation(SEND_CHAT_MESSAGE);
}

export function usePassPriority() {
  return useMutation(PASS_PRIORITY);
}

export function useRespondToSpellReaction() {
  return useMutation(RESPOND_TO_SPELL_REACTION);
}

export function useRespondToChainReaction() {
  return useMutation(RESPOND_TO_CHAIN_REACTION);
}

export function useReportMatchResult() {
  return useMutation(REPORT_MATCH_RESULT);
}

export function useConcedeMatch() {
  return useMutation(CONCEDE_MATCH);
}

// ============================================================================
// CARD CATALOG & DECKLIST HOOKS
// ============================================================================

export function useCardCatalog(filter?: Record<string, unknown>) {
  return useQuery(GET_CARD_CATALOG, {
    variables: { filter },
  });
}

export function useDecklists(userId: string | null) {
  return useQuery(GET_DECKLISTS, {
    variables: { userId: userId || '' },
    skip: !userId,
    fetchPolicy: 'cache-and-network',
  });
}

export function useSaveDecklist() {
  return useMutation(SAVE_DECKLIST);
}

export function useDeleteDecklist() {
  return useMutation(DELETE_DECKLIST);
}

export function useMatchmakingStatus(
  userId: string | null,
  mode: 'ranked' | 'free',
  pollInterval = 5000
) {
  const variables = useMemo(
    () => ({
      userId: userId || '',
      mode,
    }),
    [userId, mode]
  );

  const skip = !userId;
  const queryResult = useQuery(GET_MATCHMAKING_STATUS, {
    variables,
    skip,
    pollInterval: !skip ? pollInterval : undefined,
    context: { skipNetworkActivity: true },
    notifyOnNetworkStatusChange: false,
  });

  useSubscription(MATCHMAKING_STATUS_UPDATED, {
    variables,
    skip,
    onData: ({ data, client }) => {
      const payload = data.data?.matchmakingStatusUpdated;
      if (!payload) {
        return;
      }
      client.writeQuery({
        query: GET_MATCHMAKING_STATUS,
        variables,
        data: { matchmakingStatus: payload },
      });
    },
  });

  return queryResult;
}

export function useJoinMatchmakingQueue() {
  return useMutation(JOIN_MATCHMAKING_QUEUE);
}

export function useLeaveMatchmakingQueue() {
  return useMutation(LEAVE_MATCHMAKING_QUEUE);
}

// ============================================================================
// SPECTATOR / REPLAY HOOKS
// ============================================================================

export function useMatchReplay(matchId: string | null) {
  return useQuery(GET_MATCH_REPLAY, {
    variables: { matchId: matchId || '' },
    skip: !matchId,
  });
}

export function useRecentMatches(limit = 10) {
  return useQuery(GET_RECENT_MATCHES, {
    variables: { limit },
  });
}

// ============================================================================
// SUBSCRIPTION HOOKS
// ============================================================================

export function useGameStateSubscription(matchId: string | null) {
  return useSubscription(GAME_STATE_CHANGED, {
    variables: { matchId: matchId || '' },
    skip: !matchId,
  });
}

export function usePlayerGameStateSubscription(
  matchId: string | null,
  playerId: string | null
) {
  return useSubscription(PLAYER_GAME_STATE_CHANGED, {
    variables: { matchId: matchId || '', playerId: playerId || '' },
    skip: !matchId || !playerId,
  });
}

export function useMatchCompletedSubscription(matchId: string | null) {
  return useSubscription(MATCH_COMPLETED, {
    variables: { matchId: matchId || '' },
    skip: !matchId,
  });
}

export function useLeaderboardSubscription() {
  return useSubscription(LEADERBOARD_UPDATED);
}

export function useCardPlayedSubscription(matchId: string | null) {
  return useSubscription(CARD_PLAYED, {
    variables: { matchId: matchId || '' },
    skip: !matchId,
  });
}

export function useAttackDeclaredSubscription(matchId: string | null) {
  return useSubscription(ATTACK_DECLARED, {
    variables: { matchId: matchId || '' },
    skip: !matchId,
  });
}

export function usePhaseChangedSubscription(matchId: string | null) {
  return useSubscription(PHASE_CHANGED, {
    variables: { matchId: matchId || '' },
    skip: !matchId,
  });
}
