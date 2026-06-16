type ProfileRow = {
  username: string | null;
  color: string | null;
  icon: string | null;
};

export function getProfile(
  profiles: ProfileRow | ProfileRow[] | null | undefined,
): ProfileRow | null {
  if (!profiles) return null;
  return Array.isArray(profiles) ? (profiles[0] ?? null) : profiles;
}
