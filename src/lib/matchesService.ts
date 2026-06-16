import { supabase } from './supabase';
import type { Match } from '../types/index';

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

function toMatch(row: MatchRow): Match | null {
  if (!row.home_team || !row.away_team) {
    return null;
  }

  return {
    id: row.id,
    match_id: row.match_id,
    home_team: row.home_team,
    away_team: row.away_team,
    home_score: row.home_score,
    away_score: row.away_score,
    status: row.status as Match['status'],
    match_date: row.match_date,
    round: row.round ?? '',
  };
}

export function getMatchesFunctionUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) {
    throw new Error('VITE_SUPABASE_URL is not configured');
  }
  return `${base.replace(/\/$/, '')}/functions/v1/get-matches`;
}

/** Fetches latest match results from Football Data API via the get-matches edge function. */
export async function fetchMatchesFromApi(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(getMatchesFunctionUrl(), {
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {},
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to fetch matches from API: ${response.status} ${body}`);
  }
}

export async function loadMatchesFromDb(): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, match_id, home_team, away_team, home_score, away_score, status, match_date, round')
    .order('match_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to load matches: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => toMatch(row as MatchRow))
    .filter((match): match is Match => match !== null);
}
