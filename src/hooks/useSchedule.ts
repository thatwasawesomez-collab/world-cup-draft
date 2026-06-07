import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { DraftPick, LeagueMember, Match } from '../types/index';

const GET_MATCHES_URL = 'https://nhgewlppofncqepkkcsw.supabase.co/functions/v1/get-matches';

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

type MatchRow = {
  id: string;
  match_id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  match_date: string;
  round: string;
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

function toMatch(row: MatchRow): Match {
  return {
    id: row.id,
    match_id: row.match_id,
    home_team: row.home_team,
    away_team: row.away_team,
    home_score: row.home_score,
    away_score: row.away_score,
    status: row.status as Match['status'],
    match_date: row.match_date,
    round: row.round,
  };
}

export function useSchedule(leagueId: string) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;

    let isMounted = true;

    const loadSchedule = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();

        console.log('Calling Edge Function with session:', session?.access_token ? 'has token' : 'no token');

        const edgeResponse = await fetch(GET_MATCHES_URL, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });

        console.log('Edge Function response status:', edgeResponse.status);
        if (!edgeResponse.ok) {
          const errorBody = await edgeResponse.text();
          console.error('Edge Function error:', errorBody);
          throw new Error(`Failed to fetch matches: ${edgeResponse.status} ${errorBody}`);
        }

        const [matchesResult, picksResult, membersResult] = await Promise.all([
          supabase
            .from('matches')
            .select('id, match_id, home_team, away_team, home_score, away_score, status, match_date, round')
            .order('match_date', { ascending: true }),
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

        if (matchesResult.error) {
          throw new Error(`Failed to fetch matches: ${matchesResult.error.message}`);
        }

        if (picksResult.error) {
          throw new Error(`Failed to fetch draft picks: ${picksResult.error.message}`);
        }

        if (membersResult.error) {
          throw new Error(`Failed to fetch league members: ${membersResult.error.message}`);
        }

        console.log('Schedule loaded - matches:', matchesResult.data?.length,
          'picks:', picksResult.data?.length,
          'members:', membersResult.data?.length);

        if (!isMounted) return;

        setMatches((matchesResult.data ?? []).map((row) => toMatch(row as MatchRow)));
        setPicks((picksResult.data ?? []).map((row) => toDraftPick(row as DraftPickRow)));
        setMembers((membersResult.data ?? []).map((row) => toLeagueMember(row as LeagueMemberRow)));
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load schedule');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadSchedule();

    return () => {
      isMounted = false;
    };
  }, [leagueId]);

  return {
    matches,
    picks,
    members,
    loading,
    error,
  };
}
