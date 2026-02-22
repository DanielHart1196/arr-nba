export type PlayerStatRow = {
  name: string;
  dnp?: boolean;
  stats: Record<string, number | string>;
  id?: string;
  jersey?: string;
  position?: string;
  headshot?: string;
};

export function parseMakesAttempts(input: string) {
  const [makesStr, attemptsStr] = (input ?? '').split('-');
  const makes = Number(makesStr ?? 0) || 0;
  const attempts = Number(attemptsStr ?? 0) || 0;
  const pct = attempts > 0 ? Math.round((makes / attempts) * 100) : 0;
  return { attempts, makes, pct };
}

function minutesToSeconds(v: any): number {
  if (typeof v === 'string') {
    const upper = v.toUpperCase();
    if (upper === 'DNP') return 0;
    const m = /^(\d+):(\d+)$/.exec(v);
    if (m) return (parseInt(m[1]) * 60) + parseInt(m[2]);
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function resolveHeadshot(raw: any): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof raw?.href === 'string') return raw.href;
  if (typeof raw?.url === 'string') return raw.url;
  return undefined;
}

export function normalizePlayers(summary: any, scoreboardEvent?: any) {
  const players: Record<'home' | 'away', PlayerStatRow[]> = { home: [], away: [] };
  const competitions = summary?.boxscore?.players ?? [];
  const nameOrder = ['MIN','PTS','FG','3PT','FT','REB','AST','TO','STL','BLK','OREB','DREB','PF','+/-'];
  const comp = scoreboardEvent?.competitions?.[0];
  const idToSide = new Map<string, 'home' | 'away'>();
  const competitors = comp?.competitors ?? [];
  for (const c of competitors) {
    const tid = String(c?.team?.id ?? '');
    const hv = c?.homeAway === 'home' ? 'home' : 'away';
    if (tid) idToSide.set(tid, hv);
  }
  const finalPlayers: Record<'home' | 'away', PlayerStatRow[]> = { home: [], away: [] };
  
  competitions.forEach((team: any, index: number) => {
    const teamId = String(team?.team?.id ?? '');
    const teamDisplayName = team?.team?.displayName ?? 'Unknown';
    let side: 'home' | 'away';
    if (idToSide.has(teamId)) {
      side = idToSide.get(teamId)!;
    } else if (team?.team?.homeAway) {
      side = team.team.homeAway === 'home' ? 'home' : 'away';
    } else {
      // Fallback if no side information is found
      side = index === 0 ? 'away' : 'home';
    }
    
    // Safety check to ensure we don't overwrite if both teams somehow map to the same side
    let targetSide: 'home' | 'away' = side;
    if (finalPlayers[targetSide].length > 0) {
      targetSide = targetSide === 'home' ? 'away' : 'home';
    }

    const statNames: string[] = team?.statistics?.[0]?.names ?? [];
    const teamPlayers = team?.statistics?.[0]?.athletes ?? [];
    const rows: PlayerStatRow[] = [];
    for (const p of teamPlayers) {
      const displayName = p?.athlete?.displayName ?? p?.athlete?.shortName ?? 'Unknown';
      const statObj: Record<string, number | string> = {};
      const statsArr: any[] = Array.isArray(p?.stats) ? p.stats : [];
      for (let i = 0; i < statNames.length; i++) {
        const key = statNames[i];
        const val = statsArr[i];
        if (key === 'FG' || key === '3PT' || key === 'FT') {
          const res = parseMakesAttempts(typeof val === 'string' ? val : String(val ?? '0-0'));
          const displayKey = key === '3PT' ? '3P' : key;
          statObj[`${displayKey}A`] = res.attempts;
          statObj[`${displayKey}M`] = res.makes;
          statObj[`${displayKey}%`] = res.pct;
        } else if (key === 'MIN') {
          statObj['MIN'] = typeof val === 'string' ? val : String(val ?? '');
        } else if (key === '+/-') {
          statObj['+/-'] = Number(val ?? 0);
        } else if (key) {
          statObj[key] = Number(val ?? 0);
        }
      }
      const minVal = statObj['MIN'];
      const dnpFlag = p?.didNotPlay === true || (typeof minVal === 'string' && minVal.toUpperCase() === 'DNP');
      const athleteId = p?.athlete?.id ? String(p.athlete.id) : undefined;
      const jersey = p?.athlete?.jersey ? String(p.athlete.jersey) : undefined;
      const position = p?.athlete?.position?.abbreviation || p?.athlete?.position?.name;
      const headshot =
        resolveHeadshot(p?.athlete?.headshot) ||
        (athleteId ? `https://a.espncdn.com/i/headshots/nba/players/full/${athleteId}.png` : undefined);
      rows.push({
        name: displayName,
        dnp: dnpFlag,
        stats: statObj,
        id: athleteId,
        jersey,
        position: position ? String(position) : undefined,
        headshot
      });
    }
    
    rows.sort((a, b) => {
      const minsA = minutesToSeconds(a?.stats?.['MIN']);
      const minsB = minutesToSeconds(b?.stats?.['MIN']);
      const rankA = (a.dnp || minsA <= 0) ? 1 : 0;
      const rankB = (b.dnp || minsB <= 0) ? 1 : 0;
      return rankA - rankB;
    });
    
    finalPlayers[targetSide] = rows;
  });
  return { players: finalPlayers, names: nameOrder };
}

export function parseLinescores(summary: any, scoreboardFallback?: any) {
  const comp = summary?.boxscore?.teams ?? [];
  const lines: Record<'home' | 'away', { team: any; periods: number[]; total: number }> = { home: { team: {}, periods: [], total: 0 }, away: { team: {}, periods: [], total: 0 } };
  const toNum = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const toPeriods = (arr: any[]) =>
    (arr ?? [])
      .map((x: any) => toNum(x?.value ?? x?.displayValue ?? x?.score ?? x))
      .filter((n: number) => Number.isFinite(n));

  for (const t of comp) {
    let side: 'home' | 'away' = t?.team?.homeAway === 'home' ? 'home' : 'away';
    
    // Check if this side is already taken (to prevent both teams mapping to 'away')
    if (lines[side].total !== 0 || Object.keys(lines[side].team).length !== 0) {
      side = side === 'home' ? 'away' : 'home';
    }

    const periods: number[] = toPeriods(t?.linescores ?? []);
    const total = toNum(t?.score ?? t?.points ?? 0) || periods.reduce((sum, v) => sum + toNum(v), 0);
    lines[side] = { team: t?.team, periods, total };
  }
  if (!lines.home.periods?.length || !lines.away.periods?.length) {
    const compFb = scoreboardFallback?.competitions?.[0] ?? summary?.header?.competitions?.[0];
    const awayTeam = compFb?.competitors?.find((c: any) => c.homeAway === 'away');
    const homeTeam = compFb?.competitors?.find((c: any) => c.homeAway === 'home');
    if (awayTeam) {
      const periods = toPeriods(awayTeam?.linescores ?? []);
      lines.away = { team: awayTeam.team, periods, total: toNum(awayTeam.score ?? 0) || periods.reduce((sum, v) => sum + toNum(v), 0) };
    }
    if (homeTeam) {
      const periods = toPeriods(homeTeam?.linescores ?? []);
      lines.home = { team: homeTeam.team, periods, total: toNum(homeTeam.score ?? 0) || periods.reduce((sum, v) => sum + toNum(v), 0) };
    }
  }
  return lines;
}
