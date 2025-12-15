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
  NEXT_PHASE,
  REPORT_MATCH_RESULT,
  CONCEDE_MATCH,
} from '@/lib/graphql/queries';
import {
  GAME_STATE_CHANGED,
  PLAYER_GAME_STATE_CHANGED,
  MATCH_COMPLETED,
  LEADERBOARD_UPDATED,
  CARD_PLAYED,
  ATTACK_DECLARED,
  PHASE_CHANGED,
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
  });
}

export function usePlayerMatch(matchId: string | null, playerId: string | null) {
  return useQuery(GET_PLAYER_MATCH, {
    variables: { matchId: matchId || '', playerId: playerId || '' },
    skip: !matchId || !playerId,
  });
}

export function useMatchHistory(userId: string | null, limit?: number) {
  return useQuery(GET_MATCH_HISTORY, {
    variables: { userId: userId || '', limit },
    skip: !userId,
  });
}

export function useMatchResult(matchId: string | null) {
  return useQuery(GET_MATCH_RESULT, {
    variables: { matchId: matchId || '' },
    skip: !matchId,
  });
}

// ============================================================================
// MATCH MUTATION HOOKS
// ============================================================================

export function useInitMatch() {
  return useMutation(INIT_MATCH);
}

export function usePlayCard() {
  return useMutation(PLAY_CARD);
}

export function useAttack() {
  return useMutation(ATTACK);
}

export function useNextPhase() {
  return useMutation(NEXT_PHASE);
}

export function useReportMatchResult() {
  return useMutation(REPORT_MATCH_RESULT);
}

export function useConcedeMatch() {
  return useMutation(CONCEDE_MATCH);
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
