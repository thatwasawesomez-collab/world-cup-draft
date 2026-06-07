import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentPicker, initDraft, isDraftComplete } from '../lib/draftService';
import type { DraftPick, DraftState, LeagueMember } from '../types/index';

const TOTAL_TEAMS = 48;

type DraftPickRow = {
  id: string;
  league_id: string;
  user_id: string;
  team_code: string;
  pick_number: number;
  round: number;
};

type LeagueMemberRow = {
  id: string;
  league_id: string;
  user_id: string;
  draft_position: number | null;
  total_points: number | null;
  profiles: {
    username: string;
    color: string;
    icon: string;
  } | null;
};

function toLeagueMember(row: LeagueMemberRow): LeagueMember {
  return {
    id: row.id,
    league_id: row.league_id,
    user_id: row.user_id,
    username: row.profiles?.username ?? '',
    color: row.profiles?.color ?? '',
    icon: row.profiles?.icon ?? '',
    draft_position: row.draft_position ?? 0,
    total_points: row.total_points ?? 0,
  };
}

function toDraftPick(row: DraftPickRow): DraftPick {
  return {
    teamId: row.team_code,
    playerId: row.user_id,
    pickNumber: row.pick_number,
  };
}

function buildDraftState(picks: DraftPick[], members: LeagueMember[]): DraftState {
  const memberCount = members.length;
  const teamsPerPerson = memberCount > 0 ? TOTAL_TEAMS / memberCount : 0;
  const baseState = initDraft(memberCount, teamsPerPerson);

  if (memberCount === 0) {
    return baseState;
  }

  if (picks.length === 0) {
    return {
      ...baseState,
      current_user_id: getCurrentPicker(baseState, members),
    };
  }

  const current_pick = picks.length + 1;
  const current_round = Math.floor(picks.length / memberCount) + 1;
  const is_complete = isDraftComplete({ ...baseState, picks }, TOTAL_TEAMS);

  const state: DraftState = {
    ...baseState,
    picks,
    current_pick,
    current_round,
    is_complete,
    current_user_id: '',
  };

  if (!is_complete) {
    state.current_user_id = getCurrentPicker(state, members);
  }

  return state;
}

export function useDraft(leagueId: string) {
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const membersRef = useRef<LeagueMember[]>([]);

  const picks = draftState?.picks ?? [];
  const isMyTurn =
    currentUserId !== '' &&
    draftState?.current_user_id === currentUserId &&
    !draftState?.is_complete;

  useEffect(() => {
    let isMounted = true;

    const loadDraft = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
          throw new Error(`Failed to get current user: ${authError.message}`);
        }

        if (!user) {
          throw new Error('You must be signed in to view the draft');
        }

        const [picksResult, membersResult] = await Promise.all([
          supabase
            .from('draft_picks')
            .select('id, league_id, user_id, team_code, pick_number, round')
            .eq('league_id', leagueId)
            .order('pick_number', { ascending: true }),
          supabase
            .from('league_members')
            .select(`
              id,
              league_id,
              user_id,
              draft_position,
              total_points,
              profiles (
                username,
                color,
                icon
              )
            `)
            .eq('league_id', leagueId)
            .order('draft_position', { ascending: true }),
        ]);

        if (picksResult.error) {
          throw new Error(`Failed to fetch draft picks: ${picksResult.error.message}`);
        }

        if (membersResult.error) {
          throw new Error(`Failed to fetch league members: ${membersResult.error.message}`);
        }

        if (!isMounted) {
          return;
        }

        const fetchedMembers = (membersResult.data ?? []).map((row) =>
          toLeagueMember(row as LeagueMemberRow),
        );
        const fetchedPicks = (picksResult.data ?? []).map((row) =>
          toDraftPick(row as DraftPickRow),
        );

        setCurrentUserId(user.id);
        membersRef.current = fetchedMembers;
        setMembers(fetchedMembers);
        setDraftState(buildDraftState(fetchedPicks, fetchedMembers));
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load draft');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDraft();

    const channel = supabase
      .channel(`draft_picks:${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'draft_picks',
          filter: `league_id=eq.${leagueId}`,
        },
        (payload) => {
          const row = payload.new as DraftPickRow;
          const newPick = toDraftPick(row);

          setDraftState((prev) => {
            if (!prev) {
              return prev;
            }

            if (prev.picks.some((pick) => pick.pickNumber === newPick.pickNumber)) {
              return prev;
            }

            const updatedPicks = [...prev.picks, newPick].sort(
              (a, b) => a.pickNumber - b.pickNumber,
            );

            return buildDraftState(updatedPicks, membersRef.current);
          });
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  useEffect(() => {
    membersRef.current = members;
    setDraftState((prev) => {
      if (!prev || members.length === 0) {
        return prev;
      }

      return buildDraftState(prev.picks, members);
    });
  }, [members]);

  const makePick = useCallback(
    async (teamCode: string) => {
      if (!draftState) {
        throw new Error('Draft is not loaded');
      }

      if (!isMyTurn) {
        throw new Error('It is not your turn to pick');
      }

      if (draftState.picks.some((pick) => pick.teamId === teamCode)) {
        throw new Error('Team has already been picked');
      }

      const { error: insertError } = await supabase.from('draft_picks').insert({
        league_id: leagueId,
        user_id: currentUserId,
        team_code: teamCode,
        pick_number: draftState.current_pick,
        round: draftState.current_round,
      });

      if (insertError) {
        throw new Error(`Failed to make pick: ${insertError.message}`);
      }
    },
    [currentUserId, draftState, isMyTurn, leagueId],
  );

  return {
    draftState,
    picks,
    members,
    currentUserId,
    isMyTurn,
    makePick,
    loading,
    error,
  };
}
