import { supabase } from '../lib/supabase';
import type { DraftType, League, LeagueMember } from '../types/index';

const INVITE_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_CHARS.charAt(Math.floor(Math.random() * INVITE_CODE_CHARS.length));
  }
  return code;
}

async function getAuthenticatedUser() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Failed to get current user: ${error.message}`);
  }

  if (!user) {
    throw new Error('You must be signed in to perform this action');
  }

  return user;
}

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

export async function createLeague(
  name: string,
  maxMembers: number,
  draftType: DraftType,
): Promise<League> {
  const user = await getAuthenticatedUser();
  const invite_code = generateInviteCode();

  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .insert({
      name,
      invite_code,
      host_user_id: user.id,
      max_members: maxMembers,
      draft_type: draftType,
    })
    .select()
    .single();

  if (leagueError) {
    throw new Error(`Failed to create league: ${leagueError.message}`);
  }

  const { error: memberError } = await supabase
    .from('league_members')
    .insert({
      league_id: league.id,
      user_id: user.id,
      draft_position: 1,
    });

  if (memberError) {
    throw new Error(`Failed to add creator to league: ${memberError.message}`);
  }

  return league as League;
}

export async function joinLeague(inviteCode: string): Promise<League> {
  const user = await getAuthenticatedUser();

  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .select()
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (leagueError) {
    throw new Error(`Failed to look up league: ${leagueError.message}`);
  }

  if (!league) {
    throw new Error('League not found');
  }

  const { count, error: countError } = await supabase
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league.id);

  if (countError) {
    throw new Error(`Failed to check league capacity: ${countError.message}`);
  }

  if ((count ?? 0) >= league.max_members) {
    throw new Error('League is full');
  }

  const { data: existingMember, error: existingError } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check league membership: ${existingError.message}`);
  }

  if (existingMember) {
    throw new Error('You are already in this league');
  }

  const { data: lastMember, error: positionError } = await supabase
    .from('league_members')
    .select('draft_position')
    .eq('league_id', league.id)
    .order('draft_position', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (positionError) {
    throw new Error(`Failed to determine draft position: ${positionError.message}`);
  }

  const nextDraftPosition = (lastMember?.draft_position ?? 0) + 1;

  const { error: joinError } = await supabase
    .from('league_members')
    .insert({
      league_id: league.id,
      user_id: user.id,
      draft_position: nextDraftPosition,
    });

  if (joinError) {
    throw new Error(`Failed to join league: ${joinError.message}`);
  }

  return league as League;
}

export async function fetchLeague(
  leagueId: string,
): Promise<{ league: League; members: LeagueMember[] }> {
  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .select()
    .eq('id', leagueId)
    .maybeSingle();

  if (leagueError) {
    throw new Error(`Failed to fetch league: ${leagueError.message}`);
  }

  if (!league) {
    throw new Error('League not found');
  }

  const { data: memberRows, error: membersError } = await supabase
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
    .order('draft_position', { ascending: true });

  if (membersError) {
    throw new Error(`Failed to fetch league members: ${membersError.message}`);
  }

  const members = (memberRows ?? []).map((row) => toLeagueMember(row as LeagueMemberRow));

  return {
    league: league as League,
    members,
  };
}
