create policy "Users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);
