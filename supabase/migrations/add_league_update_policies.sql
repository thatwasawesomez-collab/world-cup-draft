-- Allow league hosts to update league settings (draft_status, draft_type, etc.)
create policy "League host can update their league"
  on leagues for update
  to authenticated
  using (host_user_id = auth.uid())
  with check (host_user_id = auth.uid());

-- Allow league hosts to update member draft positions after the lottery
create policy "League host can update league members"
  on league_members for update
  to authenticated
  using (
    exists (
      select 1
      from leagues
      where leagues.id = league_members.league_id
        and leagues.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from leagues
      where leagues.id = league_members.league_id
        and leagues.host_user_id = auth.uid()
    )
  );
