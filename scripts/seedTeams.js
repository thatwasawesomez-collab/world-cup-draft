import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const TEAMS = [
  // Group A
  { id: 'mx', name: 'Mexico', group: 'A', flagCode: 'mx', fifaRanking: 15 },
  { id: 'za', name: 'South Africa', group: 'A', flagCode: 'za', fifaRanking: 68 },
  { id: 'kr', name: 'South Korea', group: 'A', flagCode: 'kr', fifaRanking: 23 },
  { id: 'cz', name: 'Czechia', group: 'A', flagCode: 'cz', fifaRanking: 37 },

  // Group B
  { id: 'ca', name: 'Canada', group: 'B', flagCode: 'ca', fifaRanking: 48 },
  { id: 'ba', name: 'Bosnia and Herzegovina', group: 'B', flagCode: 'ba', fifaRanking: 62 },
  { id: 'qa', name: 'Qatar', group: 'B', flagCode: 'qa', fifaRanking: 58 },
  { id: 'ch', name: 'Switzerland', group: 'B', flagCode: 'ch', fifaRanking: 19 },

  // Group C
  { id: 'br', name: 'Brazil', group: 'C', flagCode: 'br', fifaRanking: 6 },
  { id: 'ma', name: 'Morocco', group: 'C', flagCode: 'ma', fifaRanking: 8 },
  { id: 'ht', name: 'Haiti', group: 'C', flagCode: 'ht', fifaRanking: 85 },
  { id: 'gb-sct', name: 'Scotland', group: 'C', flagCode: 'gb-sct', fifaRanking: 39 },

  // Group D
  { id: 'us', name: 'USA', group: 'D', flagCode: 'us', fifaRanking: 16 },
  { id: 'py', name: 'Paraguay', group: 'D', flagCode: 'py', fifaRanking: 52 },
  { id: 'au', name: 'Australia', group: 'D', flagCode: 'au', fifaRanking: 24 },
  { id: 'tr', name: 'Türkiye', group: 'D', flagCode: 'tr', fifaRanking: 29 },

  // Group E
  { id: 'de', name: 'Germany', group: 'E', flagCode: 'de', fifaRanking: 10 },
  { id: 'cw', name: 'Curaçao', group: 'E', flagCode: 'cw', fifaRanking: 81 },
  { id: 'ci', name: 'Ivory Coast', group: 'E', flagCode: 'ci', fifaRanking: 41 },
  { id: 'ec', name: 'Ecuador', group: 'E', flagCode: 'ec', fifaRanking: 44 },

  // Group F
  { id: 'nl', name: 'Netherlands', group: 'F', flagCode: 'nl', fifaRanking: 7 },
  { id: 'jp', name: 'Japan', group: 'F', flagCode: 'jp', fifaRanking: 18 },
  { id: 'se', name: 'Sweden', group: 'F', flagCode: 'se', fifaRanking: 35 },
  { id: 'tn', name: 'Tunisia', group: 'F', flagCode: 'tn', fifaRanking: 42 },

  // Group G
  { id: 'be', name: 'Belgium', group: 'G', flagCode: 'be', fifaRanking: 9 },
  { id: 'eg', name: 'Egypt', group: 'G', flagCode: 'eg', fifaRanking: 47 },
  { id: 'ir', name: 'Iran', group: 'G', flagCode: 'ir', fifaRanking: 25 },
  { id: 'nz', name: 'New Zealand', group: 'G', flagCode: 'nz', fifaRanking: 93 },

  // Group H
  { id: 'es', name: 'Spain', group: 'H', flagCode: 'es', fifaRanking: 2 },
  { id: 'cv', name: 'Cape Verde', group: 'H', flagCode: 'cv', fifaRanking: 73 },
  { id: 'sa', name: 'Saudi Arabia', group: 'H', flagCode: 'sa', fifaRanking: 57 },
  { id: 'uy', name: 'Uruguay', group: 'H', flagCode: 'uy', fifaRanking: 17 },

  // Group I
  { id: 'fr', name: 'France', group: 'I', flagCode: 'fr', fifaRanking: 1 },
  { id: 'sn', name: 'Senegal', group: 'I', flagCode: 'sn', fifaRanking: 14 },
  { id: 'iq', name: 'Iraq', group: 'I', flagCode: 'iq', fifaRanking: 63 },
  { id: 'no', name: 'Norway', group: 'I', flagCode: 'no', fifaRanking: 34 },

  // Group J
  { id: 'ar', name: 'Argentina', group: 'J', flagCode: 'ar', fifaRanking: 3 },
  { id: 'dz', name: 'Algeria', group: 'J', flagCode: 'dz', fifaRanking: 36 },
  { id: 'at', name: 'Austria', group: 'J', flagCode: 'at', fifaRanking: 32 },
  { id: 'jo', name: 'Jordan', group: 'J', flagCode: 'jo', fifaRanking: 66 },

  // Group K
  { id: 'pt', name: 'Portugal', group: 'K', flagCode: 'pt', fifaRanking: 5 },
  { id: 'cd', name: 'DR Congo', group: 'K', flagCode: 'cd', fifaRanking: 55 },
  { id: 'uz', name: 'Uzbekistan', group: 'K', flagCode: 'uz', fifaRanking: 74 },
  { id: 'co', name: 'Colombia', group: 'K', flagCode: 'co', fifaRanking: 13 },

  // Group L
  { id: 'gb-eng', name: 'England', group: 'L', flagCode: 'gb-eng', fifaRanking: 4 },
  { id: 'hr', name: 'Croatia', group: 'L', flagCode: 'hr', fifaRanking: 11 },
  { id: 'gh', name: 'Ghana', group: 'L', flagCode: 'gh', fifaRanking: 54 },
  { id: 'pa', name: 'Panama', group: 'L', flagCode: 'pa', fifaRanking: 43 },
];

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const teams = TEAMS.map((team) => ({
  team_code: team.id,
  team_name: team.name,
  group_letter: team.group,
  flag_code: team.flagCode,
  fifa_ranking: team.fifaRanking,
}));

const { error } = await supabase
  .from('teams')
  .upsert(teams, { onConflict: 'team_code' });

if (error) {
  console.error('Failed to seed teams:', error.message);
  process.exit(1);
}

console.log(`Seeded ${teams.length} teams successfully`);
