import { b as apiCache, R as RedditService, a as RedditTransformer } from "./reddit.service.js";
import { R as RedditDataSource } from "./reddit.datasource.js";
class ESPNDataSource {
  async getScoreboard(date) {
    const url = date ? `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}` : "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ESPN Scoreboard error: ${res.status}`);
    return res.json();
  }
  async getSummary(eventId) {
    const res = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`);
    if (!res.ok) throw new Error(`ESPN Summary error: ${res.status}`);
    return res.json();
  }
}
function parseMakesAttempts(input) {
  const [makesStr, attemptsStr] = (input ?? "").split("-");
  const makes = Number(makesStr ?? 0) || 0;
  const attempts = Number(attemptsStr ?? 0) || 0;
  const pct = attempts > 0 ? Math.round(makes / attempts * 100) : 0;
  return { attempts, makes, pct };
}
function minutesToSeconds(v) {
  if (typeof v === "string") {
    const upper = v.toUpperCase();
    if (upper === "DNP") return 0;
    const m = /^(\d+):(\d+)$/.exec(v);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    const n2 = Number(v);
    return isNaN(n2) ? 0 : n2;
  }
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function normalizePlayers(summary, scoreboardEvent) {
  const competitions = summary?.boxscore?.players ?? [];
  const nameOrder = ["MIN", "PTS", "FG", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "OREB", "DREB", "PF", "+/-"];
  const comp = scoreboardEvent?.competitions?.[0];
  const idToSide = /* @__PURE__ */ new Map();
  const competitors = comp?.competitors ?? [];
  for (const c of competitors) {
    const tid = String(c?.team?.id ?? "");
    const hv = c?.homeAway === "home" ? "home" : "away";
    if (tid) idToSide.set(tid, hv);
  }
  const finalPlayers = { home: [], away: [] };
  competitions.forEach((team, index) => {
    const teamId = String(team?.team?.id ?? "");
    team?.team?.displayName ?? "Unknown";
    let side;
    if (idToSide.has(teamId)) {
      side = idToSide.get(teamId);
    } else if (team?.team?.homeAway) {
      side = team.team.homeAway === "home" ? "home" : "away";
    } else {
      side = index === 0 ? "away" : "home";
    }
    let targetSide = side;
    if (finalPlayers[targetSide].length > 0) {
      targetSide = targetSide === "home" ? "away" : "home";
    }
    const statNames = team?.statistics?.[0]?.names ?? [];
    const teamPlayers = team?.statistics?.[0]?.athletes ?? [];
    const rows = [];
    for (const p of teamPlayers) {
      const displayName = p?.athlete?.displayName ?? p?.athlete?.shortName ?? "Unknown";
      const statObj = {};
      const statsArr = Array.isArray(p?.stats) ? p.stats : [];
      for (let i = 0; i < statNames.length; i++) {
        const key = statNames[i];
        const val = statsArr[i];
        if (key === "FG" || key === "3PT" || key === "FT") {
          const res = parseMakesAttempts(typeof val === "string" ? val : String(val ?? "0-0"));
          const displayKey = key === "3PT" ? "3P" : key;
          statObj[`${displayKey}A`] = res.attempts;
          statObj[`${displayKey}M`] = res.makes;
          statObj[`${displayKey}%`] = res.pct;
        } else if (key === "MIN") {
          statObj["MIN"] = typeof val === "string" ? val : String(val ?? "");
        } else if (key === "+/-") {
          statObj["+/-"] = Number(val ?? 0);
        } else if (key) {
          statObj[key] = Number(val ?? 0);
        }
      }
      const minVal = statObj["MIN"];
      const dnpFlag = p?.didNotPlay === true || typeof minVal === "string" && minVal.toUpperCase() === "DNP";
      rows.push({ name: displayName, dnp: dnpFlag, stats: statObj });
    }
    rows.sort((a, b) => {
      const minsA = minutesToSeconds(a?.stats?.["MIN"]);
      const minsB = minutesToSeconds(b?.stats?.["MIN"]);
      const rankA = a.dnp || minsA <= 0 ? 1 : 0;
      const rankB = b.dnp || minsB <= 0 ? 1 : 0;
      return rankA - rankB;
    });
    finalPlayers[targetSide] = rows;
  });
  return { players: finalPlayers, names: nameOrder };
}
function parseLinescores(summary, scoreboardFallback) {
  const comp = summary?.boxscore?.teams ?? [];
  const lines = { home: { team: {}, periods: [], total: 0 }, away: { team: {}, periods: [], total: 0 } };
  for (const t of comp) {
    let side = t?.team?.homeAway === "home" ? "home" : "away";
    if (lines[side].total !== 0 || Object.keys(lines[side].team).length !== 0) {
      side = side === "home" ? "away" : "home";
    }
    const ls = t?.linescores ?? [];
    const periods = ls.map((p) => Number(p?.value ?? 0));
    const total = Number(t?.score ?? 0);
    lines[side] = { team: t?.team, periods, total };
  }
  if ((!lines.home.periods?.length || !lines.away.periods?.length) && scoreboardFallback) {
    const compFb = scoreboardFallback?.competitions?.[0];
    const awayTeam = compFb?.competitors?.find((c) => c.homeAway === "away");
    const homeTeam = compFb?.competitors?.find((c) => c.homeAway === "home");
    const toPeriods = (arr) => (arr ?? []).map((x) => Number(x?.value ?? 0));
    if (awayTeam) lines.away = { team: awayTeam.team, periods: toPeriods(awayTeam?.linescores ?? []), total: Number(awayTeam.score ?? 0) };
    if (homeTeam) lines.home = { team: homeTeam.team, periods: toPeriods(homeTeam?.linescores ?? []), total: Number(homeTeam.score ?? 0) };
  }
  return lines;
}
class ESPNBasketTransformer {
  transformBoxscore(summary, event) {
    const { players, names } = normalizePlayers(summary, event);
    const linescores = parseLinescores(summary, event);
    const status = (() => {
      const comp = event?.competitions?.[0];
      const type = comp?.status?.type;
      const clock = comp?.status?.displayClock || "";
      const period = comp?.status?.period || 0;
      const short = type?.shortDetail || "";
      const name = type?.name || "";
      return { clock, period, short, name };
    })();
    return {
      id: summary?.id || event?.id || "",
      boxscore: summary?.boxscore ?? {},
      players,
      linescores,
      names,
      status
    };
  }
}
let NBAService$1 = class NBAService {
  constructor(dataSource, transformer, cache) {
    this.dataSource = dataSource;
    this.transformer = transformer;
    this.cache = cache;
  }
  async getScoreboard(date) {
    const cacheKey = date ? `scoreboard:${date}` : "scoreboard";
    return this.cache.getOrFetch(
      cacheKey,
      async () => {
        const data = await this.dataSource.getScoreboard(date);
        return { events: data?.events ?? [] };
      },
      30 * 1e3
      // 30 seconds TTL
    );
  }
  async getBoxscore(eventId) {
    const cacheKey = `boxscore:${eventId}`;
    return this.cache.getOrFetch(
      cacheKey,
      async () => {
        const [summary, scoreboard] = await Promise.all([
          this.dataSource.getSummary(eventId),
          this.getScoreboard()
        ]);
        const event = scoreboard.events.find((e) => String(e.id) === String(eventId));
        return this.transformer.transformBoxscore(summary, event);
      },
      15 * 1e3
      // 15 seconds TTL
    );
  }
  async prewarmBoxscores(eventIds) {
    const promises = eventIds.map(
      (id) => this.getBoxscore(id).catch((error) => {
        console.warn(`Failed to prewarm boxscore ${id}:`, error);
      })
    );
    await Promise.allSettled(promises);
  }
  cleanupCache() {
    if (this.cache.cleanup) {
      this.cache.cleanup();
    }
  }
};
class NBAService2 {
  nbaService;
  redditService;
  constructor() {
    const espnDataSource = new ESPNDataSource();
    const basketTransformer = new ESPNBasketTransformer();
    const redditDataSource = new RedditDataSource();
    const redditTransformer = new RedditTransformer();
    this.nbaService = new NBAService$1(espnDataSource, basketTransformer, apiCache);
    this.redditService = new RedditService(redditDataSource, redditTransformer, apiCache);
  }
  async getScoreboard(date) {
    return this.nbaService.getScoreboard(date);
  }
  async getBoxscore(eventId) {
    return this.nbaService.getBoxscore(eventId);
  }
  async getRedditIndex() {
    return this.redditService.getRedditIndex();
  }
  async searchRedditThread(request) {
    return this.redditService.searchRedditThread(request);
  }
  async getRedditComments(postId, sort = "new", permalink, bypassCache = false) {
    return this.redditService.getRedditComments(postId, sort, permalink, bypassCache);
  }
  async prewarmBoxscores(eventIds) {
    return this.nbaService.prewarmBoxscores(eventIds);
  }
  clearRedditCache() {
    this.redditService.clearRedditCache();
  }
  async forceRefreshReddit() {
    this.clearRedditCache();
  }
  cleanupCache() {
    this.nbaService.cleanupCache();
  }
}
const nbaService = new NBAService2();
export {
  nbaService as n
};
