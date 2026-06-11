/** Football Data API three-letter codes → internal team ids (matches `teams.team_code`). */
export const TLA_TO_TEAM: Record<string, string> = {
  MEX: 'mx', RSA: 'za', KOR: 'kr', CZE: 'cz',
  CAN: 'ca', BIH: 'ba', QAT: 'qa', SUI: 'ch',
  BRA: 'br', MAR: 'ma', HAI: 'ht', SCO: 'gb-sct',
  USA: 'us', PAR: 'py', AUS: 'au', TUR: 'tr',
  GER: 'de', CUW: 'cw', CIV: 'ci', ECU: 'ec',
  NED: 'nl', JPN: 'jp', SWE: 'se', TUN: 'tn',
  BEL: 'be', EGY: 'eg', IRN: 'ir', NZL: 'nz',
  ESP: 'es', CPV: 'cv', KSA: 'sa', URU: 'uy',
  FRA: 'fr', SEN: 'sn', IRQ: 'iq', NOR: 'no',
  ARG: 'ar', ALG: 'dz', AUT: 'at', JOR: 'jo',
  POR: 'pt', COD: 'cd', UZB: 'uz', COL: 'co',
  ENG: 'gb-eng', CRO: 'hr', GHA: 'gh', PAN: 'pa',
};

/** Normalize a TLA or internal team id to the canonical `team_code`. */
export function normalizeTeamCode(code: unknown): string {
  if (code == null) return '';
  if (typeof code !== 'string') {
    return String(code).toLowerCase();
  }
  const trimmed = code.trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  return TLA_TO_TEAM[upper] ?? trimmed.toLowerCase();
}

/** Flag CDN code for display (same as internal id after normalization). */
export function toFlagCode(teamCode: unknown): string {
  return normalizeTeamCode(teamCode);
}
