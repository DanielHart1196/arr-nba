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

export function formatTeamName(team: Team): string {
  return team?.shortDisplayName || team?.displayName || 'Unknown';
}

export function getTeamAbbreviation(team: Team): string {
  return team?.abbreviation || formatTeamName(team).split(' ').map(w => w[0]).join('').toUpperCase();
}
