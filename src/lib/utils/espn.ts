export type PlayerStatRow = {
  name: string;
  dnp?: boolean;
  stats: Record<string, number | string>;
};

export function parseMakesAttempts(input: string) {
  const [makesStr, attemptsStr] = (input ?? '').split('-');
  const makes = Number(makesStr ?? 0) || 0;
  const attempts = Number(attemptsStr ?? 0) || 0;
  const pct = attempts > 0 ? Math.round((makes / attempts) * 100) : 0;
  return { attempts, makes, pct };
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
  for (const team of competitions) {
    const teamId = String(team?.team?.id ?? '');
    const mapped = (teamId && idToSide.get(teamId)) || (team?.team?.homeAway === 'home' ? 'home' : 'away');
    const side: 'home' | 'away' = mapped === 'home' ? 'home' : 'away';
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
          statObj[`${key}A`] = res.attempts;
          statObj[`${key}M`] = res.makes;
          statObj[`${key}%`] = res.pct;
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
      rows.push({ name: displayName, dnp: dnpFlag, stats: statObj });
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
    function rank(r: PlayerStatRow): number {
      const mins = minutesToSeconds(r?.stats?.['MIN']);
      return (r.dnp || mins <= 0) ? 1 : 0;
    }
    rows.sort((a, b) => rank(a) - rank(b));
    players[side] = rows;
  }
  return { players, names: nameOrder };
}

export function parseLinescores(summary: any, scoreboardFallback?: any) {
  const comp = summary?.boxscore?.teams ?? [];
  const lines: Record<'home' | 'away', { team: any; periods: number[]; total: number }> = { home: { team: {}, periods: [], total: 0 }, away: { team: {}, periods: [], total: 0 } };
  for (const t of comp) {
    const side: 'home' | 'away' = t?.team?.homeAway === 'home' ? 'home' : 'away';
    const ls = t?.linescores ?? [];
    const periods: number[] = ls.map((p: any) => Number(p?.value ?? 0));
    const total = Number(t?.score ?? 0);
    lines[side] = { team: t?.team, periods, total };
  }
  if ((!lines.home.periods?.length || !lines.away.periods?.length) && scoreboardFallback) {
    const compFb = scoreboardFallback?.competitions?.[0];
    const awayTeam = compFb?.competitors?.find((c: any) => c.homeAway === 'away');
    const homeTeam = compFb?.competitors?.find((c: any) => c.homeAway === 'home');
    const toPeriods = (arr: any[]) => (arr ?? []).map((x: any) => Number(x?.value ?? 0));
    if (awayTeam) lines.away = { team: awayTeam.team, periods: toPeriods(awayTeam?.linescores ?? []), total: Number(awayTeam.score ?? 0) };
    if (homeTeam) lines.home = { team: homeTeam.team, periods: toPeriods(homeTeam?.linescores ?? []), total: Number(homeTeam.score ?? 0) };
  }
  return lines;
}
