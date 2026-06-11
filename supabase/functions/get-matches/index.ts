import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { tlaToTeamCode } from '../_shared/teamCodes.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FootballDataMatch = {
  id: number;
  status: string;
  utcDate: string;
  stage: string;
  homeTeam: { tla: string };
  awayTeam: { tla: string };
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
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
  if (status === 'IN_PLAY') return 'live';
  return 'scheduled';
}

function mapMatch(match: FootballDataMatch): Match {
  return {
    match_id: match.id.toString(),
    home_team: tlaToTeamCode(match.homeTeam.tla),
    away_team: tlaToTeamCode(match.awayTeam.tla),
    home_score: match.score.fullTime.home,
    away_score: match.score.fullTime.away,
    status: mapStatus(match.status),
    match_date: match.utcDate,
    round: match.stage,
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
    const matches = (data.matches ?? []).map(mapMatch);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
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
