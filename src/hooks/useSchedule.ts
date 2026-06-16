import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMatchesFromApi, loadMatchesFromDb } from '../lib/matchesService';
import { getProfile } from '../lib/profileUtils';
import { supabase } from '../lib/supabase';
import type { DraftPick, LeagueMember, Match } from '../types/index';

const LIVE_REFRESH_MS = 60_000;

type DraftPickRow = {
  team_code: string;
  user_id: string;
  pick_number: number;
};

type LeagueMemberRow = {
  id: string;
  league_id: string;
  user_id: string;
  draft_position: number | null;
  total_points: number | null;
  profiles: {
    username: string | null;
    color: string | null;
    icon: string | null;
  } | {
    username: string | null;
    color: string | null;
    icon: string | null;
  }[] | null;
};

function toLeagueMember(row: LeagueMemberRow): LeagueMember {
  const profile = getProfile(row.profiles);
  return {
    id: row.id,
    league_id: row.league_id,
    user_id: row.user_id,
    username: profile?.username ?? '',
    color: profile?.color ?? '',
    icon: profile?.icon ?? '',
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

async function loadLeagueScheduleData(leagueId: string) {
  const [matches, picksResult, membersResult] = await Promise.all([
    loadMatchesFromDb(),
    supabase
      .from('draft_picks')
      .select('team_code, user_id, pick_number')
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

  return {
    matches,
    picks: (picksResult.data ?? []).map((row) => toDraftPick(row as DraftPickRow)),
    members: (membersResult.data ?? []).map((row) => toLeagueMember(row as LeagueMemberRow)),
  };
}

type RefreshOptions = {
  silent?: boolean;
};

export function useSchedule(leagueId: string, options?: { pollWhenLive?: boolean }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);

  const refreshMatches = useCallback(async (refreshOptions?: RefreshOptions) => {
    if (!leagueId || refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    const silent = refreshOptions?.silent ?? false;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      try {
        await fetchMatchesFromApi();
      } catch (apiErr) {
        console.warn('Sports API refresh failed, using cached matches:', apiErr);
      }

      const data = await loadLeagueScheduleData(leagueId);
      setMatches(data.matches);
      setPicks(data.picks);
      setMembers(data.members);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load schedule');
      }
    } finally {
      refreshInFlightRef.current = false;
      if (!silent) {
        setLoading(false);
      }
    }
  }, [leagueId]);

  const reloadMatchesFromDb = useCallback(async () => {
    if (!leagueId) return;
    try {
      const data = await loadMatchesFromDb();
      setMatches(data);
    } catch (err) {
      console.warn('Failed to reload matches from realtime:', err);
    }
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    refreshMatches();
  }, [leagueId, refreshMatches]);

  useEffect(() => {
    if (!leagueId) return;

    const channel = supabase
      .channel(`matches:${leagueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => {
          reloadMatchesFromDb();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId, reloadMatchesFromDb]);

  const hasLiveMatches = matches.some((m) => m.status === 'live');
  const pollWhenLive = options?.pollWhenLive ?? true;

  useEffect(() => {
    if (!leagueId || !pollWhenLive || !hasLiveMatches) return;

    const interval = setInterval(() => {
      refreshMatches({ silent: true });
    }, LIVE_REFRESH_MS);

    return () => clearInterval(interval);
  }, [leagueId, pollWhenLive, hasLiveMatches, refreshMatches]);

  return {
    matches,
    picks,
    members,
    loading,
    error,
    hasLiveMatches,
    refreshMatches,
  };
}
