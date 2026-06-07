-- Server-side auto-draft for timed-out picks. Any league member can trigger this;
-- the pick is always assigned to whoever's turn it is (random team, not host-chosen).
--
-- Run this entire script in Supabase SQL Editor. Safe to run multiple times.

create or replace function public.auto_draft_timeout_pick(
  p_league_id uuid,
  p_team_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_count int;
  v_pick_count int;
  v_current_pick int;
  v_current_round int;
  v_pick_in_round int;
  v_is_reverse boolean;
  v_picker_index int;
  v_picker_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from league_members
    where league_id = p_league_id
      and user_id = auth.uid()
  ) then
    raise exception 'Not a league member';
  end if;

  if exists (
    select 1
    from draft_picks
    where league_id = p_league_id
      and team_code = p_team_code
  ) then
    raise exception 'Team already picked';
  end if;

  select count(*) into v_member_count
  from league_members
  where league_id = p_league_id;

  if v_member_count = 0 then
    raise exception 'No league members';
  end if;

  select count(*) into v_pick_count
  from draft_picks
  where league_id = p_league_id;

  if v_pick_count >= 48 then
    raise exception 'Draft complete';
  end if;

  v_current_pick := v_pick_count + 1;
  v_current_round := floor(v_pick_count::numeric / v_member_count)::int + 1;
  v_pick_in_round := (v_current_pick - 1) % v_member_count;
  v_is_reverse := v_current_round % 2 = 0;

  if v_is_reverse then
    v_picker_index := v_member_count - 1 - v_pick_in_round;
  else
    v_picker_index := v_pick_in_round;
  end if;

  select user_id into v_picker_user_id
  from league_members
  where league_id = p_league_id
  order by draft_position asc
  offset v_picker_index
  limit 1;

  insert into draft_picks (league_id, user_id, team_code, pick_number, round)
  values (p_league_id, v_picker_user_id, p_team_code, v_current_pick, v_current_round);
end;
$$;

revoke all on function public.auto_draft_timeout_pick(uuid, text) from public;
grant execute on function public.auto_draft_timeout_pick(uuid, text) to authenticated;

-- Optional indexes (skipped automatically if test data has duplicates)
do $$
begin
  if not exists (
    select 1
    from draft_picks
    group by league_id, pick_number
    having count(*) > 1
  ) then
    create unique index if not exists draft_picks_league_pick_number_unique
      on draft_picks (league_id, pick_number);
  end if;

  if not exists (
    select 1
    from draft_picks
    group by league_id, team_code
    having count(*) > 1
  ) then
    create unique index if not exists draft_picks_league_team_code_unique
      on draft_picks (league_id, team_code);
  end if;
end $$;
