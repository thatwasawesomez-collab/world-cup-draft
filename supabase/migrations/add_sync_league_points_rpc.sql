-- Allow any league member to persist computed standings via a security-definer RPC.
create or replace function public.sync_league_member_points(
  p_league_id uuid,
  p_points jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from league_members
    where league_id = p_league_id
      and user_id = auth.uid()
  ) then
    raise exception 'Not a league member';
  end if;

  update league_members lm
  set total_points = entry.value::int
  from jsonb_each_text(p_points) as entry(key, value)
  where lm.league_id = p_league_id
    and lm.user_id = entry.key::uuid;
end;
$$;

grant execute on function public.sync_league_member_points(uuid, jsonb) to authenticated;
