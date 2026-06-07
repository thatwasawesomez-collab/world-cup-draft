import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentPicker, initDraft, isDraftComplete } from '../lib/draftService';
import type { DraftPick, DraftState, LeagueMember } from '../types/index';

const TOTAL_TEAMS = 48;
const POLL_INTERVAL_MS = 2000;

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

async function fetchDraftData(leagueId: string) {
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

  const members = (membersResult.data ?? []).map((row) =>
    toLeagueMember(row as LeagueMemberRow),
  );
  const picks = (picksResult.data ?? []).map((row) =>
    toDraftPick(row as DraftPickRow),
  );

  return {
    members,
    picks,
    draftState: buildDraftState(picks, members),
  };
}

export function useDraft(leagueId: string) {
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const membersRef = useRef<LeagueMember[]>([]);
  const draftStateRef = useRef<DraftState | null>(null);
  draftStateRef.current = draftState;

  const picks = draftState?.picks ?? [];
  const isMyTurn = currentUserId !== '' &&
    draftState?.current_user_id === currentUserId &&
    !draftState?.is_complete;
  const applyDraftData = useCallback((
    fetchedMembers: LeagueMember[],
    fetchedPicks: DraftPick[],
  ) => {
    const nextState = buildDraftState(fetchedPicks, fetchedMembers);
    membersRef.current = fetchedMembers;
    draftStateRef.current = nextState;
    setMembers(fetchedMembers);
    setDraftState(nextState);
    return nextState;
  }, []);

  const refreshDraft = useCallback(async (): Promise<DraftState | null> => {
    if (!leagueId) return null;

    try {
      const data = await fetchDraftData(leagueId);
      const nextState = applyDraftData(data.members, data.picks);
      setError(null);
      return nextState;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh draft');
      return null;
    }
  }, [leagueId, applyDraftData]);

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

        const data = await fetchDraftData(leagueId);

        if (!isMounted) {
          return;
        }

        setCurrentUserId(user.id);
        applyDraftData(data.members, data.picks);
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
      .channel(`draft-picks-${leagueId}`)
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

            const next = buildDraftState(updatedPicks, membersRef.current);
            draftStateRef.current = next;
            return next;
          });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          refreshDraft();
        }
      });

    const pollInterval = setInterval(() => {
      refreshDraft();
    }, POLL_INTERVAL_MS);

    const handleReconnect = () => {
      refreshDraft();
    };

    window.addEventListener('online', handleReconnect);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleReconnect();
      }
    });

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      window.removeEventListener('online', handleReconnect);
      supabase.removeChannel(channel);
    };
  }, [leagueId, applyDraftData, refreshDraft]);

  useEffect(() => {
    membersRef.current = members;
    setDraftState((prev) => {
      if (!prev || members.length === 0) {
        return prev;
      }

      const next = buildDraftState(prev.picks, members);
      draftStateRef.current = next;
      return next;
    });
  }, [members]);

  const onPickMade = useCallback((newPick: DraftPick) => {
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

      const next = buildDraftState(updatedPicks, membersRef.current);
      draftStateRef.current = next;
      return next;
    });
  }, []);

  const insertPick = useCallback(
    async (teamCode: string, pickerUserId: string, pickNumber: number, round: number) => {
      const { error: insertError } = await supabase.from('draft_picks').insert({
        league_id: leagueId,
        user_id: pickerUserId,
        team_code: teamCode,
        pick_number: pickNumber,
        round,
      });

      if (insertError) {
        if (insertError.code === '23505') {
          await refreshDraft();
          return;
        }
        throw new Error(`Failed to make pick: ${insertError.message}`);
      }

      onPickMade({
        teamId: teamCode,
        playerId: pickerUserId,
        pickNumber,
      });
    },
    [leagueId, onPickMade, refreshDraft],
  );

  const makePick = useCallback(
    async (teamCode: string) => {
      const state = draftStateRef.current;
      if (!state) {
        throw new Error('Draft is not loaded');
      }

      if (state.current_user_id !== currentUserId || state.is_complete) {
        throw new Error('It is not your turn to pick');
      }

      if (state.picks.some((pick) => pick.teamId === teamCode)) {
        throw new Error('Team has already been picked');
      }

      await insertPick(
        teamCode,
        currentUserId,
        state.current_pick,
        state.current_round,
      );
    },
    [currentUserId, insertPick],
  );

  const autoDraftTimeoutPick = useCallback(
    async (teamCode: string) => {
      const { error: rpcError } = await supabase.rpc('auto_draft_timeout_pick', {
        p_league_id: leagueId,
        p_team_code: teamCode,
      });

      if (rpcError) {
        if (rpcError.code === '23505') {
          await refreshDraft();
          return;
        }
        throw new Error(rpcError.message);
      }

      await refreshDraft();
    },
    [leagueId, refreshDraft],
  );

  return {
    draftState,
    picks,
    members,
    currentUserId,
    isMyTurn,
    makePick,
    autoDraftTimeoutPick,
    refreshDraft,
    loading,
    error,
  };
}
