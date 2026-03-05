// Team name variations for better Reddit matching
export const TEAM_NAME_VARIATIONS: Record<string, string[]> = {
  'Hawks': ['Hawks', 'Atlanta Hawks', 'ATL'],
  'Celtics': ['Celtics', 'Boston Celtics', 'BOS'],
  'Nets': ['Nets', 'Brooklyn Nets', 'BKN'],
  'Hornets': ['Hornets', 'Charlotte Hornets', 'CHA'],
  'Bulls': ['Bulls', 'Chicago Bulls', 'CHI'],
  'Cavaliers': ['Cavaliers', 'Cavs', 'Cleveland Cavaliers', 'CLE'],
  'Mavericks': ['Mavericks', 'Mavs', 'Dallas Mavericks', 'DAL'],
  'Nuggets': ['Nuggets', 'Denver Nuggets', 'DEN'],
  'Pistons': ['Pistons', 'Detroit Pistons', 'DET'],
  'Warriors': ['Warriors', 'Golden State Warriors', 'GSW', 'Dubs'],
  'Rockets': ['Rockets', 'Houston Rockets', 'HOU'],
  'Pacers': ['Pacers', 'Indiana Pacers', 'IND'],
  'Clippers': ['Clippers', 'Los Angeles Clippers', 'LA Clippers', 'LAC'],
  'Lakers': ['Lakers', 'Los Angeles Lakers', 'LA Lakers', 'LAL'],
  'Grizzlies': ['Grizzlies', 'Memphis Grizzlies', 'MEM'],
  'Heat': ['Heat', 'Miami Heat', 'MIA'],
  'Bucks': ['Bucks', 'Milwaukee Bucks', 'MIL'],
  'Timberwolves': ['Timberwolves', 'Wolves', 'Minnesota Timberwolves', 'MIN'],
  'Pelicans': ['Pelicans', 'New Orleans Pelicans', 'NOP', 'NO Pelicans'],
  'Knicks': ['Knicks', 'New York Knicks', 'NYK', 'NY Knicks'],
  'Thunder': ['Thunder', 'Oklahoma City Thunder', 'OKC'],
  'Magic': ['Magic', 'Orlando Magic', 'ORL'],
  '76ers': ['76ers', 'Sixers', 'Philadelphia 76ers', 'PHI', 'Philly 76ers'],
  'Suns': ['Suns', 'Phoenix Suns', 'PHX'],
  'Trail Blazers': ['Trail Blazers', 'Blazers', 'Portland Trail Blazers', 'POR', 'Rip City'],
  'Kings': ['Kings', 'Sacramento Kings', 'SAC'],
  'Spurs': ['Spurs', 'San Antonio Spurs', 'SAS', 'SA Spurs'],
  'Raptors': ['Raptors', 'Toronto Raptors', 'TOR'],
  'Jazz': ['Jazz', 'Utah Jazz', 'UTA'],
  'Wizards': ['Wizards', 'Washington Wizards', 'WAS']
};

function normalizeTerm(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsTerm(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function matchesVariation(teamName: string, variation: string): boolean {
  const name = normalizeTerm(teamName);
  const alias = normalizeTerm(variation);
  if (!name || !alias) return false;
  return name === alias || containsTerm(name, alias) || containsTerm(alias, name);
}

export function expandTeamNames(teamNames: string[]): string[] {
  const expandedNames: string[] = [];

  for (const teamName of teamNames) {
    if (!teamName) continue;
    // Add the original name
    expandedNames.push(teamName);

    // Find and add all variations
    for (const [canonical, variations] of Object.entries(TEAM_NAME_VARIATIONS)) {
      if (variations.some((variation) => matchesVariation(teamName, variation) || matchesVariation(teamName, canonical))) {
        expandedNames.push(...variations);
        break;
      }
    }
  }
  
  // Remove duplicates and return
  return [...new Set(expandedNames)];
}

export function normalizeTeamName(teamName: string): string {
  const normalized = teamName.trim();

  // Check if this matches any known team variations
  for (const [canonical, variations] of Object.entries(TEAM_NAME_VARIATIONS)) {
    if (variations.some((variation) => matchesVariation(normalized, variation) || matchesVariation(normalized, canonical))) {
      return canonical;
    }
  }

  return normalized;
}
