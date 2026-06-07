import { supabase } from './supabase';
import type { DraftPick, Match } from '../types/index';

/**
 * Calculates total points per user from finished matches and draft picks.
 * Win = 3pts, draw = 1pt per team, loss = 0pts.
 */
export function calculatePoints(picks: DraftPick[], matches: Match[]): Map<string, number> {
  const pointsMap = new Map<string, number>();
  const teamToUser = new Map<string, string>();

  for (const pick of picks) {
    teamToUser.set(pick.teamId, pick.playerId);
    if (!pointsMap.has(pick.playerId)) {
      pointsMap.set(pick.playerId, 0);
    }
  }

  for (const match of matches) {
    if (match.status !== 'finished') {
      continue;
    }

    if (match.home_score === null || match.away_score === null) {
      continue;
    }

    const homeUser = teamToUser.get(match.home_team);
    const awayUser = teamToUser.get(match.away_team);

    if (match.home_score > match.away_score) {
      if (homeUser) {
        pointsMap.set(homeUser, (pointsMap.get(homeUser) ?? 0) + 3);
      }
    } else if (match.away_score > match.home_score) {
      if (awayUser) {
        pointsMap.set(awayUser, (pointsMap.get(awayUser) ?? 0) + 3);
      }
    } else {
      if (homeUser) {
        pointsMap.set(homeUser, (pointsMap.get(homeUser) ?? 0) + 1);
      }
      if (awayUser) {
        pointsMap.set(awayUser, (pointsMap.get(awayUser) ?? 0) + 1);
      }
    }
  }

  return pointsMap;
}

/**
 * Persists calculated points to league_members.total_points for a league.
 */
export async function updateLeagueMemberPoints(
  leagueId: string,
  pointsMap: Map<string, number>,
): Promise<void> {
  const updates = Array.from(pointsMap.entries()).map(async ([userId, totalPoints]) => {
    const { error } = await supabase
      .from('league_members')
      .update({ total_points: totalPoints })
      .eq('league_id', leagueId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to update points for user ${userId}: ${error.message}`);
    }
  });

  await Promise.all(updates);
}
