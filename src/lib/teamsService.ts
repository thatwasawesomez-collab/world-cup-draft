import { supabase } from './supabase';

export type TeamRankingRow = {
  team_code: string;
  fifa_ranking: number | null;
};

/** Live FIFA rankings from the Supabase `teams` table. */
export async function loadTeamRankings(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('teams')
    .select('team_code, fifa_ranking');

  if (error) {
    throw new Error(`Failed to load team rankings: ${error.message}`);
  }

  const rankings: Record<string, number> = {};
  for (const row of (data ?? []) as TeamRankingRow[]) {
    if (row.team_code && row.fifa_ranking != null) {
      rankings[row.team_code] = row.fifa_ranking;
    }
  }
  return rankings;
}
