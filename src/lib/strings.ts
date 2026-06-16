/** Safe first-letter initial for avatars; never throws. */
export function userInitial(name: string | null | undefined): string {
  if (typeof name !== 'string' || !name) return '?';
  return name.charAt(0).toUpperCase();
}
