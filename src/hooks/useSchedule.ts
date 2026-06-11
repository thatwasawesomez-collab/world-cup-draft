import { useCallback, useEffect, useState } from 'react';
import { fetchMatchesFromApi, loadMatchesFromDb } from '../lib/matchesService';
import { supabase } from '../lib/supabase';
import type { DraftPick, LeagueMember, Match } from '../types/index';

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

export function useSchedule(leagueId: string) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMatches = useCallback(async () => {
    if (!leagueId) return;

    setLoading(true);
    setError(null);

    try {
      await fetchMatchesFromApi();
      const data = await loadLeagueScheduleData(leagueId);
      setMatches(data.matches);
      setPicks(data.picks);
      setMembers(data.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    refreshMatches();
  }, [leagueId, refreshMatches]);

  return {
    matches,
    picks,
    members,
    loading,
    error,
    refreshMatches,
  };
}
