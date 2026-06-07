-- profiles
create table profiles (
  id uuid references auth.users primary key,
  username text not null,
  color text not null,
  icon text not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Authenticated users can read all profiles"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- leagues
create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  host_user_id uuid references profiles(id),
  max_members int default 6,
  draft_type text default 'untimed',
  draft_status text default 'pending',
  created_at timestamptz default now()
);

alter table leagues enable row level security;

create policy "Authenticated users can read all leagues"
  on leagues for select
  to authenticated
  using (true);

create policy "Authenticated users can insert their own leagues"
  on leagues for insert
  to authenticated
  with check (auth.uid() = host_user_id);

-- league_members
create table league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references leagues(id) on delete cascade,
  user_id uuid references profiles(id),
  draft_position int,
  total_points int default 0,
  joined_at timestamptz default now(),
  unique (league_id, user_id)
);

alter table league_members enable row level security;

create policy "Authenticated users can read all league members"
  on league_members for select
  to authenticated
  using (true);

create policy "Authenticated users can insert their own league membership"
  on league_members for insert
  to authenticated
  with check (auth.uid() = user_id);

-- draft_picks
create table draft_picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references leagues(id) on delete cascade,
  user_id uuid references profiles(id),
  team_code text not null,
  pick_number int not null,
  round int not null,
  picked_at timestamptz default now()
);

alter table draft_picks enable row level security;

create policy "Authenticated users can read all draft picks"
  on draft_picks for select
  to authenticated
  using (true);

create policy "Authenticated users can insert their own draft picks"
  on draft_picks for insert
  to authenticated
  with check (auth.uid() = user_id);

-- teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  team_code text unique not null,
  team_name text not null,
  group_letter text not null,
  flag_code text not null,
  fifa_ranking int
);

alter table teams enable row level security;

create policy "Authenticated users can read teams"
  on teams for select
  to authenticated
  using (true);

-- matches
create table matches (
  id uuid primary key default gen_random_uuid(),
  match_id text unique not null,
  home_team text references teams(team_code),
  away_team text references teams(team_code),
  home_score int,
  away_score int,
  status text default 'scheduled',
  match_date timestamptz,
  round text
);

alter table matches enable row level security;

create policy "Authenticated users can read matches"
  on matches for select
  to authenticated
  using (true);
