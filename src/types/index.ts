export type DraftType = 'untimed' | '2min' | '5min';

export interface Player {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface DraftPick {
  teamId: string;
  playerId: string;
  pickNumber: number;
}

export interface Profile {
  id: string;
  email: string;
  username: string;
  avatar_url?: string;
}

export interface League {
  id: string;
  name: string;
  invite_code: string;
  host_user_id: string;
  max_members: number;
  draft_status: 'pending' | 'active' | 'lottery' | 'complete';
  draft_type: DraftType;
  created_at: string;
}

export interface LeagueMember {
  id: string;
  league_id: string;
  user_id: string;
  username: string;
  color: string;
  icon: string;
  draft_position: number;
  total_points: number;
}

export interface Team {
  id: string;
  team_code: string;
  team_name: string;
  group_letter: string;
  flag_code: string;
  fifa_ranking: number;
}

export interface Match {
  id: string;
  match_id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: 'scheduled' | 'live' | 'finished';
  match_date: string;
  round: string;
}

export interface DraftState {
  current_pick: number;
  current_round: number;
  current_user_id: string;
  picks: DraftPick[];
  is_complete: boolean;
}
