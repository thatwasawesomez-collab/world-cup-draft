import { supabase } from './supabase';
import { normalizeTeamCode } from './teamCodes';
import type { DraftPick, Match } from '../types/index';

function isGroupStage(round: unknown): boolean {
  if (typeof round !== 'string' || !round) return false;
  const r = round.toUpperCase();
  return r.includes('GROUP') || r === 'GROUP_STAGE';
}

function pointsForResult(isWin: boolean, isDraw: boolean, round: string): number {
  if (isDraw) {
    return isGroupStage(round) ? 1 : 0;
  }
  if (isWin) {
    return 2;
  }
  return 0;
}

function lookupUserForTeam(
  teamCode: unknown,
  teamToUser: Map<string, string>,
): string | undefined {
  if (teamCode == null || teamCode === '') return undefined;
  const normalized = normalizeTeamCode(teamCode);
  if (!normalized) return undefined;
  return teamToUser.get(normalized) ?? (typeof teamCode === 'string' ? teamToUser.get(teamCode) : undefined);
}

/**
 * Calculates total points per user from finished matches and draft picks.
 * Group Stage: win = 2pts, tie = 1pt. Bracket: win = 2pts.
 */
export function calculatePoints(picks: DraftPick[], matches: Match[]): Map<string, number> {
  const pointsMap = new Map<string, number>();
  const teamToUser = new Map<string, string>();

  for (const pick of picks) {
    const teamId = normalizeTeamCode(pick.teamId);
    teamToUser.set(teamId, pick.playerId);
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

    const homeUser = lookupUserForTeam(match.home_team, teamToUser);
    const awayUser = lookupUserForTeam(match.away_team, teamToUser);
    const isDraw = match.home_score === match.away_score;

    if (isDraw) {
      const drawPts = pointsForResult(false, true, match.round);
      if (homeUser) {
        pointsMap.set(homeUser, (pointsMap.get(homeUser) ?? 0) + drawPts);
      }
      if (awayUser) {
        pointsMap.set(awayUser, (pointsMap.get(awayUser) ?? 0) + drawPts);
      }
      continue;
    }

    const homeWin = match.home_score > match.away_score;
    const homePts = pointsForResult(homeWin, false, match.round);
    const awayPts = pointsForResult(!homeWin, false, match.round);

    if (homeUser) {
      pointsMap.set(homeUser, (pointsMap.get(homeUser) ?? 0) + homePts);
    }
    if (awayUser) {
      pointsMap.set(awayUser, (pointsMap.get(awayUser) ?? 0) + awayPts);
    }
  }

  return pointsMap;
}

/** Points earned by a single team across finished matches. */
export function calculateTeamPoints(teamId: string, matches: Match[]): number {
  const normalizedId = normalizeTeamCode(teamId);
  let pts = 0;

  for (const match of matches) {
    if (match.status !== 'finished' || match.home_score === null || match.away_score === null) {
      continue;
    }

    const home = normalizeTeamCode(match.home_team);
    const away = normalizeTeamCode(match.away_team);
    const isHome = home === normalizedId;
    const isAway = away === normalizedId;
    if (!isHome && !isAway) {
      continue;
    }

    const isDraw = match.home_score === match.away_score;
    if (isDraw) {
      pts += pointsForResult(false, true, match.round);
    } else if (isHome) {
      pts += pointsForResult(match.home_score > match.away_score, false, match.round);
    } else {
      pts += pointsForResult(match.away_score > match.home_score, false, match.round);
    }
  }

  return pts;
}

/**
 * Persists calculated points to league_members.total_points for a league.
 */
export async function updateLeagueMemberPoints(
  leagueId: string,
  pointsMap: Map<string, number>,
): Promise<void> {
  const pPoints = Object.fromEntries(pointsMap.entries());

  const { error } = await supabase.rpc('sync_league_member_points', {
    p_league_id: leagueId,
    p_points: pPoints,
  });

  if (error) {
    throw new Error(`Failed to sync league points: ${error.message}`);
  }
}
