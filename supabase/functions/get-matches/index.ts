import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { tlaToTeamCode } from '../_shared/teamCodes.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ScoreBlock = {
  home?: number | null;
  away?: number | null;
  homeTeam?: number | null;
  awayTeam?: number | null;
};

type FootballDataGoal = {
  score?: ScoreBlock;
};

type FootballDataTeam = {
  tla?: string | null;
  id?: number;
};

type FootballDataMatch = {
  id: number;
  status: string;
  utcDate: string;
  stage: string;
  homeTeam: FootballDataTeam;
  awayTeam: FootballDataTeam;
  score?: {
    winner?: string | null;
    fullTime?: ScoreBlock;
    regularTime?: ScoreBlock;
  };
  goals?: FootballDataGoal[];
};

type Match = {
  match_id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: 'scheduled' | 'live' | 'finished';
  match_date: string;
  round: string;
};

function mapStatus(status: string): Match['status'] {
  if (status === 'FINISHED') return 'finished';
  if (status === 'IN_PLAY' || status === 'PAUSED') return 'live';
  return 'scheduled';
}

function readScoreBlock(block?: ScoreBlock): { home: number | null; away: number | null } {
  if (!block) {
    return { home: null, away: null };
  }

  const home = block.home ?? block.homeTeam ?? null;
  const away = block.away ?? block.awayTeam ?? null;
  return { home, away };
}

function extractScores(match: FootballDataMatch): { home: number | null; away: number | null } {
  const fromFullTime = readScoreBlock(match.score?.fullTime);
  if (fromFullTime.home != null && fromFullTime.away != null) {
    return fromFullTime;
  }

  const fromRegularTime = readScoreBlock(match.score?.regularTime);
  if (fromRegularTime.home != null && fromRegularTime.away != null) {
    return fromRegularTime;
  }

  const goals = match.goals ?? [];
  if (goals.length > 0) {
    const lastGoal = goals[goals.length - 1];
    const fromGoals = readScoreBlock(lastGoal.score);
    if (fromGoals.home != null && fromGoals.away != null) {
      return fromGoals;
    }
  }

  if (match.status === 'FINISHED' && match.score?.winner) {
    if (match.score.winner === 'HOME_TEAM') return { home: 1, away: 0 };
    if (match.score.winner === 'AWAY_TEAM') return { home: 0, away: 1 };
    if (match.score.winner === 'DRAW') return { home: 0, away: 0 };
  }

  return { home: null, away: null };
}

function hasScores(match: FootballDataMatch): boolean {
  const { home, away } = extractScores(match);
  return home != null && away != null;
}

async function enrichMatchScores(
  apiKey: string,
  match: FootballDataMatch,
): Promise<FootballDataMatch> {
  if (match.status !== 'FINISHED' || hasScores(match)) {
    return match;
  }

  const detailResponse = await fetch(`https://api.football-data.org/v4/matches/${match.id}`, {
    headers: { 'X-Auth-Token': apiKey },
  });

  if (!detailResponse.ok) {
    return match;
  }

  return await detailResponse.json() as FootballDataMatch;
}

function mapMatch(match: FootballDataMatch): Match | null {
  if (!match.homeTeam?.tla || !match.awayTeam?.tla) {
    return null;
  }

  const { home, away } = extractScores(match);

  return {
    match_id: match.id.toString(),
    home_team: tlaToTeamCode(match.homeTeam.tla),
    away_team: tlaToTeamCode(match.awayTeam.tla),
    home_score: home,
    away_score: away,
    status: mapStatus(match.status),
    match_date: match.utcDate,
    round: match.stage,
  };
}

function mergeWithExisting(incoming: Match, existing?: Match): Match {
  if (!existing) {
    return incoming;
  }

  return {
    ...incoming,
    home_score: incoming.home_score ?? existing.home_score,
    away_score: incoming.away_score ?? existing.away_score,
    status:
      incoming.status === 'scheduled' && existing.status === 'finished'
        ? existing.status
        : incoming.status,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('FOOTBALL_DATA_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'FOOTBALL_DATA_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Supabase environment is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const matchdayParam = url.searchParams.get('matchday');

    let apiUrl = 'https://api.football-data.org/v4/competitions/WC/matches';
    if (matchdayParam !== null) {
      const matchday = Number(matchdayParam);
      if (!Number.isFinite(matchday)) {
        return new Response(JSON.stringify({ error: 'matchday must be a number' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      apiUrl += `?matchday=${matchday}`;
    }

    const apiResponse = await fetch(apiUrl, {
      headers: { 'X-Auth-Token': apiKey },
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      return new Response(
        JSON.stringify({ error: `Football Data API error: ${apiResponse.status}`, details: errorBody }),
        {
          status: apiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const data = await apiResponse.json() as { matches?: FootballDataMatch[] };
    const rawMatches = data.matches ?? [];

    const enrichedMatches = await Promise.all(
      rawMatches.map((match) => enrichMatchScores(apiKey, match)),
    );

    const incomingMatches = enrichedMatches
      .map(mapMatch)
      .filter((match): match is Match => match !== null);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const matchIds = incomingMatches.map((match) => match.match_id);
    const { data: existingRows, error: existingError } = matchIds.length > 0
      ? await supabase
        .from('matches')
        .select('match_id, home_team, away_team, home_score, away_score, status, match_date, round')
        .in('match_id', matchIds)
      : { data: [], error: null };

    if (existingError) {
      return new Response(JSON.stringify({ error: existingError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const existingById = new Map(
      (existingRows ?? []).map((row) => [row.match_id, row as Match]),
    );

    const matches = incomingMatches.map((match) =>
      mergeWithExisting(match, existingById.get(match.match_id)),
    );

    const { error: upsertError } = await supabase
      .from('matches')
      .upsert(matches, { onConflict: 'match_id' });

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(matches), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
