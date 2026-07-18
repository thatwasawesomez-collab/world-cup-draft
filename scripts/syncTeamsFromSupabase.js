import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const { data, error } = await supabase
  .from('teams')
  .select('team_code, team_name, group_letter, flag_code, fifa_ranking')
  .order('group_letter', { ascending: true })
  .order('fifa_ranking', { ascending: true, nullsFirst: false });

if (error) {
  console.error('Failed to fetch teams:', error.message);
  process.exit(1);
}

if (!data?.length) {
  console.error('No teams found in Supabase');
  process.exit(1);
}

const teams = data.map((row) => ({
  id: row.team_code,
  name: row.team_name,
  group: row.group_letter,
  flagCode: row.flag_code,
  fifaRanking: row.fifa_ranking ?? 0,
}));

function formatTeamsArray(teamsList) {
  const groups = new Map();
  for (const team of teamsList) {
    if (!groups.has(team.group)) groups.set(team.group, []);
    groups.get(team.group).push(team);
  }

  const lines = ['['];
  for (const [group, groupTeams] of groups) {
    lines.push(`  // Group ${group}`);
    for (const team of groupTeams) {
      lines.push(
        `  { id: '${team.id}', name: '${team.name.replace(/'/g, "\\'")}', group: '${team.group}', flagCode: '${team.flagCode}', fifaRanking: ${team.fifaRanking} },`,
      );
    }
    lines.push('');
  }
  // drop trailing blank line before closing bracket
  if (lines[lines.length - 1] === '') lines.pop();
  lines.push(']');
  return lines.join('\n');
}

const teamsLiteral = formatTeamsArray(teams);

function replaceTeamsExport(filePath, pattern, replacement) {
  const source = readFileSync(filePath, 'utf8');
  if (!pattern.test(source)) {
    console.error(`Could not find TEAMS array in ${filePath}`);
    process.exit(1);
  }
  writeFileSync(filePath, source.replace(pattern, replacement));
}

const storePath = join(root, 'src/app/store.ts');
replaceTeamsExport(
  storePath,
  /export const TEAMS: Team\[] = \[[\s\S]*?\];/,
  `export const TEAMS: Team[] = ${teamsLiteral};`,
);

const seedPath = join(root, 'scripts/seedTeams.js');
replaceTeamsExport(
  seedPath,
  /const TEAMS = \[[\s\S]*?\];/,
  `const TEAMS = ${teamsLiteral};`,
);

console.log(`Synced ${teams.length} teams from Supabase → store.ts and seedTeams.js`);
