export interface Team {
  id?: string;
  abbreviation?: string;
  shortDisplayName?: string;
  displayName?: string;
  homeAway?: 'home' | 'away';
}

export function getTeamLogoAbbr(team: Team): string {
  const raw = (team?.abbreviation || '').toUpperCase();
  const map: Record<string, string> = {
    SA: 'SAS',
    NO: 'NOP',
    GS: 'GSW',
    NY: 'NYK',
    PHO: 'PHX',
    WSH: 'WAS',
    UTAH: 'UTA',
    TOR: 'TOR',
    MIN: 'MIN',
    MIA: 'MIA',
    SAS: 'SAS'
  };
  
  const name = (team?.shortDisplayName || team?.displayName || '').toUpperCase();
  const nameMap: Record<string, string> = {
    'UTAH': 'UTA',
    'LOS ANGELES CLIPPERS': 'LAC',
    'LA CLIPPERS': 'LAC',
    'LOS ANGELES LAKERS': 'LAL',
    'LA LAKERS': 'LAL',
    'GOLDEN STATE': 'GSW',
    'NEW ORLEANS': 'NOP',
    'SAN ANTONIO': 'SAS',
    'NEW YORK': 'NYK',
    'PHOENIX': 'PHX',
    'WASHINGTON': 'WAS'
  };
  
  const ab = map[raw] || raw;
  if (!nameMap[name] && name.includes('UTAH')) return 'UTA';
  return nameMap[name] || ab || '';
}

export function getTeamLogoPath(team: Team): string {
  return getTeamLogoPathByAbbr(getTeamLogoAbbr(team));
}

export function getTeamLogoPathByAbbr(abbr: string): string {
  const normalized = (abbr || '').toUpperCase();
  if (!normalized) return '';
  const pngByAbbr: Record<string, string> = {
    SAS: '/logos/SAS.png',
    HOU: '/logos/HOU.png',
    UTA: '/logos/UTA.png'
  };
  if (pngByAbbr[normalized]) return pngByAbbr[normalized];
  return `/logos/${normalized}.svg`;
}

export function getTeamLogoScaleByAbbr(abbr: string, baseScale = 1): number {
  const normalized = (abbr || '').toUpperCase();
  const perTeamScale: Record<string, number> = {
    DAL: 0.82,
    HOU: 1.42,
    LAC: 0.8,
    ORL: 0.9,
    SAC: 0.9,
    SAS: 0.88,
    UTA: 0.9
  };
  return baseScale * (perTeamScale[normalized] ?? 1);
}

export function getTeamLogoScaleStyleByAbbr(abbr: string, baseScale = 1): string {
  return `transform: scale(${getTeamLogoScaleByAbbr(abbr, baseScale)});`;
}

export function getTeamLogoScaleStyle(team: Team, baseScale = 1): string {
  return getTeamLogoScaleStyleByAbbr(getTeamLogoAbbr(team), baseScale);
}

export function formatTeamName(team: Team): string {
  return team?.shortDisplayName || team?.displayName || 'Unknown';
}

export function getTeamAbbreviation(team: Team): string {
  return team?.abbreviation || formatTeamName(team).split(' ').map(w => w[0]).join('').toUpperCase();
}
