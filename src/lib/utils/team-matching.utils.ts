// Team name variations for better Reddit matching
export const TEAM_NAME_VARIATIONS: Record<string, string[]> = {
  'Lakers': ['Lakers', 'Los Angeles Lakers', 'LA Lakers', 'LAL'],
  'Celtics': ['Celtics', 'Boston Celtics', 'BOS'],
  'Warriors': ['Warriors', 'Golden State Warriors', 'GSW', 'Dubs'],
  'Nets': ['Nets', 'Brooklyn Nets', 'BKN'],
  'Knicks': ['Knicks', 'New York Knicks', 'NYK', 'NY Knicks'],
  '76ers': ['76ers', 'Sixers', 'Philadelphia 76ers', 'PHI', 'PHL 76ers'],
  'Raptors': ['Raptors', 'Toronto Raptors', 'TOR'],
  'Bulls': ['Bulls', 'Chicago Bulls', 'CHI'],
  'Cavaliers': ['Cavaliers', 'Cavs', 'Cleveland Cavaliers', 'CLE'],
  'Pistons': ['Pistons', 'Detroit Pistons', 'DET'],
  'Pacers': ['Pacers', 'Indiana Pacers', 'IND'],
  'Bucks': ['Bucks', 'Milwaukee Bucks', 'MIL'],
  'Heat': ['Heat', 'Miami Heat', 'MIA'],
  'Magic': ['Magic', 'Orlando Magic', 'ORL'],
  'Hawks': ['Hawks', 'Atlanta Hawks', 'ATL'],
  'Hornets': ['Hornets', 'Charlotte Hornets', 'CHA'],
  'Wizards': ['Wizards', 'Washington Wizards', 'WAS'],
  'Mavericks': ['Mavericks', 'Mavs', 'Dallas Mavericks', 'DAL'],
  'Rockets': ['Rockets', 'Houston Rockets', 'HOU'],
  'Grizzlies': ['Grizzlies', 'Memphis Grizzlies', 'MEM'],
  'Pelicans': ['Pelicans', 'New Orleans Pelicans', 'NOP'],
  'Spurs': ['Spurs', 'San Antonio Spurs', 'SAS'],
  'Nuggets': ['Nuggets', 'Denver Nuggets', 'DEN'],
  'Timberwolves': ['Timberwolves', 'Wolves', 'Minnesota Timberwolves', 'MIN'],
  'Trail Blazers': ['Trail Blazers', 'Blazers', 'Portland Trail Blazers', 'POR'],
  'Thunder': ['Thunder', 'Oklahoma City Thunder', 'OKC'],
  'Jazz': ['Jazz', 'Utah Jazz', 'UTA'],
  'Clippers': ['Clippers', 'Los Angeles Clippers', 'LA Clippers', 'LAC'],
  'Suns': ['Suns', 'Phoenix Suns', 'PHX'],
  'Kings': ['Kings', 'Sacramento Kings', 'SAC']
};

export function expandTeamNames(teamNames: string[]): string[] {
  const expandedNames: string[] = [];
  
  for (const teamName of teamNames) {
    // Add the original name
    expandedNames.push(teamName);
    
    // Find and add all variations
    for (const [canonical, variations] of Object.entries(TEAM_NAME_VARIATIONS)) {
      if (variations.some(variation => 
        teamName.toLowerCase().includes(variation.toLowerCase()) ||
        variation.toLowerCase().includes(teamName.toLowerCase())
      )) {
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
    if (variations.some(variation => 
      normalized.toLowerCase() === variation.toLowerCase() ||
      normalized.toLowerCase().includes(variation.toLowerCase()) ||
      variation.toLowerCase().includes(normalized.toLowerCase())
    )) {
      return canonical;
    }
  }
  
  return normalized;
}
