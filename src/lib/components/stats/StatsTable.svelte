<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Player } from '../../types/nba';
  import { openSeasonStatsModal, seasonStatsModal, updateSeasonStatsModal } from '../../stores/seasonStatsModal.store';
  import { preferredHeadshotUrl } from '../../utils/headshots';
  import { loadAllSeasonHistoryEntries } from '../../utils/season-history';
  import { getSeasonLeadersWithFallback } from '../../utils/season-leaders';

  export let players: Player[];
  export let currentTeamAbbr: string = '';

  const statCols = [
    'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'OREB', 'DREB', 'FGM', 'FGA', 'FG%', '3PM', '3PA', '3P%', 'FTM', 'FTA', 'FT%', 'PF', 'TO', '+/-'
  ];
  const statLabels: Record<string, string> = {
    OREB: 'OR',
    DREB: 'DR'
  };
  const percentKeys = ['FG%', '3P%', 'FT%'] as const;
  const baseTotalKeys = statCols.filter((k) => k !== 'MIN' && k !== '+/-' && !percentKeys.includes(k as (typeof percentKeys)[number]));

  function formatStat(row: Player, key: string) {
    if (key === 'FG%') return row.stats['FG%'] + '%';
    if (key === '3P%') return row.stats['3P%'] + '%';
    if (key === 'FT%') return row.stats['FT%'] + '%';
    return row.stats[key];
  }

  function formatName(n: string) {
    const parts = (n || '').split(' ').filter(Boolean);
    if (parts.length === 0) return n || '';
    if (parts.length === 1) return parts[0];
    const firstInitial = parts[0][0].toUpperCase() + '.';
    const rest = parts.slice(1).join(' ');
    return `${firstInitial} ${rest}`;
  }

  function normalizeName(n: string): string {
    return (n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function espnHeadshotUrl(id?: string): string {
    return preferredHeadshotUrl(id);
  }

  function pct(m: number, a: number) {
    return a > 0 ? Math.round((m / a) * 100) : 0;
  }

  function sumPlayersByKey(rows: Player[], key: string): number {
    return rows.reduce((total, player) => {
      const value = Number(player?.stats?.[key] ?? 0);
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  function buildTotals(rows: Player[]): Record<string, number | string> {
    const totals: Record<string, number | string> = {};

    for (const key of baseTotalKeys) {
      totals[key] = sumPlayersByKey(rows, key);
    }

    totals['MIN'] = '';
    totals['+/-'] = '';
    totals['FG%'] = `${pct(Number(totals.FGM ?? 0), Number(totals.FGA ?? 0))}%`;
    totals['3P%'] = `${pct(Number(totals['3PM'] ?? 0), Number(totals['3PA'] ?? 0))}%`;
    totals['FT%'] = `${pct(Number(totals.FTM ?? 0), Number(totals.FTA ?? 0))}%`;

    return totals;
  }

  $: safePlayers = players ?? [];
  $: displayRows = safePlayers.map((row) => ({
    ...row,
    rawName: row?.name ?? '',
    displayName: formatName(row?.name ?? ''),
    statValues: statCols.map((key) => formatStat(row, key))
  }));
  $: totalsByKey = buildTotals(safePlayers);
  $: formattedLongest = Math.max(...displayRows.map((r) => r.displayName.length), 6);
  $: nameColWidth = `${Math.min(formattedLongest, 13)}ch`;
  $: statColWidth = '2rem';

  let modalOpen = false;
  let seasonLoading = false;
  let seasonError = '';
  let seasonData: { players: { headers?: string[]; rows: any[] } } | null = null;
  let selectedPlayer: Player | null = null;
  let selectedSeasonRow: Record<string, any> | null = null;
  const SEASON_CACHE_KEY = 'arrnba:season-leaders-cache';
  const SEASON_CACHE_TTL_MS = 10 * 60 * 1000;
  const historyCache = new Map<string, { rows: { season: string; row: Record<string, any> | null }[]; headers: string[] }>();
  let historyRequestSeq = 0;

  const unsubscribeModal = seasonStatsModal.subscribe((state) => {
    if (!state.open && modalOpen) {
      modalOpen = false;
      selectedPlayer = null;
      selectedSeasonRow = null;
      seasonError = '';
      seasonLoading = false;
    }
  });

  onDestroy(() => {
    unsubscribeModal();
  });

  function readSeasonCache(): { ts: number; data: any } | null {
    try {
      const raw = localStorage.getItem(SEASON_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.ts || !parsed?.data) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeSeasonCache(data: any): void {
    try {
      localStorage.setItem(SEASON_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  function hasPlayerRows(data: any): boolean {
    return Array.isArray(data?.players?.rows) && data.players.rows.length > 0;
  }

  async function ensureSeasonData(): Promise<void> {
    if (seasonData || seasonLoading) return;
    seasonError = '';
    const cached = typeof localStorage !== 'undefined' ? readSeasonCache() : null;
    const cachedHasRows = hasPlayerRows(cached?.data);
    if (cached?.data) {
      seasonData = cached.data;
      if (Date.now() - Number(cached.ts) < SEASON_CACHE_TTL_MS && cachedHasRows) return;
    }

    seasonLoading = true;
    updateSeasonStatsModal({ loading: true });
    try {
      const currentSeason = seasonFromDate();
      const json = await getSeasonLeadersWithFallback(currentSeason, 'PerGame');
      if (hasPlayerRows(json)) {
        seasonData = json;
      } else if (!cachedHasRows) {
        seasonError = 'Season leaders data is temporarily unavailable';
        updateSeasonStatsModal({ error: seasonError });
      }

      if (typeof localStorage !== 'undefined' && hasPlayerRows(json)) {
        writeSeasonCache(json);
      }
    } catch (e: any) {
      if (!seasonData) {
        seasonError = e?.message ?? 'Failed to load season stats';
        seasonData = null;
        updateSeasonStatsModal({ error: seasonError });
      }
    } finally {
      seasonLoading = false;
      updateSeasonStatsModal({ loading: false });
    }
  }

  function findSeasonRow(player: Player): Record<string, any> | null {
    const rows = seasonData?.players?.rows ?? [];
    if (!rows.length) return null;
    if (player?.id) {
      const byId = rows.find((r) => String(r.PLAYER_ID) === String(player.id));
      if (byId) return byId;
    }
    const needle = normalizeName(player?.name ?? '');
    if (!needle) return null;
    return rows.find((r) => normalizeName(String(r.PLAYER_NAME ?? '')) === needle) ?? null;
  }

  function filterSeasonHeaders(headers: string[]): string[] {
    if (!Array.isArray(headers)) return [];
    const ageIndex = headers.indexOf('AGE');
    const fromAge = ageIndex >= 0 ? headers.slice(ageIndex) : headers;
    return fromAge.filter((h) => {
      const upper = String(h || '').toUpperCase();
      if (!upper) return false;
      if (upper.includes('RANK')) return false;
      if (upper.includes('FANTASY')) return false;
      if (upper.includes('PCT')) {
        return (
          upper === 'FG_PCT' ||
          upper === 'FG3_PCT' ||
          upper === 'FT_PCT' ||
          upper === 'TS_PCT' ||
          upper === 'EFG_PCT' ||
          upper === 'USG_PCT' ||
          upper === 'AST_PCT' ||
          upper === 'REB_PCT' ||
          upper === 'OREB_PCT' ||
          upper === 'DREB_PCT' ||
          upper === 'TM_TOV_PCT'
        );
      }
      if (upper === 'TEAM_COUNT') return false;
      return true;
    });
  }

  function seasonFromDate(date = new Date()): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const startYear = month >= 10 ? year : year - 1;
    const endYear = String(startYear + 1).slice(-2);
    return `${startYear}-${endYear}`;
  }

  function buildSeasonList(count = 25): string[] {
    const base = seasonFromDate();
    const startYear = Number(base.slice(0, 4)) || new Date().getFullYear();
    const seasons: string[] = [];
    for (let i = 0; i < count; i++) {
      const y = startYear - i;
      const end = String(y + 1).slice(-2);
      seasons.push(`${y}-${end}`);
    }
    return seasons;
  }

  async function loadSeasonHistory(player: Player): Promise<void> {
    const playerId = player?.id ? String(player.id) : '';
    if (!playerId) return;
    const requestSeq = ++historyRequestSeq;
    const canApply = () => requestSeq === historyRequestSeq && String($seasonStatsModal.playerId ?? '') === playerId;
    const fallbackTeam = String(
      $seasonStatsModal.player?.teamAbbr ??
      $seasonStatsModal.team ??
      ''
    ).trim().toUpperCase();

    const cached = historyCache.get(playerId);
    if (cached) {
      if (!canApply()) return;
      const cachedTeam =
        cached.rows.find((entry) => String(entry?.row?.TEAM_ABBREVIATION ?? entry?.row?.TEAM ?? '').trim())?.row
          ?.TEAM_ABBREVIATION ??
        cached.rows.find((entry) => String(entry?.row?.TEAM_ABBREVIATION ?? entry?.row?.TEAM ?? '').trim())?.row?.TEAM ??
        '';
      updateSeasonStatsModal({
        historyRows: cached.rows,
        headers: cached.headers,
        team: String(cachedTeam || fallbackTeam).toUpperCase(),
        historyLoading: false,
        historyError: ''
      });
      return;
    }

    updateSeasonStatsModal({ historyLoading: true, historyError: '' });
    try {
      const historyData = await loadAllSeasonHistoryEntries();
      if (!canApply()) return;

      const rows: { season: string; row: Record<string, any> | null }[] = [];
      let headers: string[] = [];
      for (const entry of historyData) {
        const season = String(entry?.season ?? '');
        const playersBlock: any = entry?.players?.perGame ?? entry?.players ?? {};
        const seasonHeaders = filterSeasonHeaders(playersBlock?.headers ?? []);
        if (seasonHeaders.length > 0 && headers.length === 0) headers = seasonHeaders;
        const seasonRows = playersBlock?.rows ?? [];
        const byId = seasonRows.find((r: any) => String(r.PLAYER_ID ?? '') === playerId);
        let row = byId ?? null;
        if (!row && player?.name) {
          const needle = normalizeName(player.name);
          row = seasonRows.find((r: any) => normalizeName(String(r.PLAYER_NAME ?? '')) === needle) ?? null;
        }
        rows.push({ season, row });
      }

      const computed = { rows, headers };
      historyCache.set(playerId, computed);
      const computedTeam =
        computed.rows.find((entry) => String(entry?.row?.TEAM_ABBREVIATION ?? entry?.row?.TEAM ?? '').trim())?.row
          ?.TEAM_ABBREVIATION ??
        computed.rows.find((entry) => String(entry?.row?.TEAM_ABBREVIATION ?? entry?.row?.TEAM ?? '').trim())?.row?.TEAM ??
        '';
      if (!canApply()) return;
      updateSeasonStatsModal({
        historyRows: computed.rows,
        headers: computed.headers,
        team: String(computedTeam || fallbackTeam).toUpperCase(),
        historyLoading: false,
        historyError: ''
      });
    } catch (e: any) {
      if (!canApply()) return;
      updateSeasonStatsModal({
        historyLoading: false,
        historyError: e?.message ?? 'Failed to load season history'
      });
    }
  }

  async function openSeasonModal(player: Player): Promise<void> {
    if (!player) return;
    const clickedTeamAbbr = String(player?.teamAbbr ?? currentTeamAbbr ?? '').trim().toUpperCase();
    selectedPlayer = player;
    selectedSeasonRow = null;
    modalOpen = true;
    openSeasonStatsModal({
      ...player,
      teamAbbr: clickedTeamAbbr || player?.teamAbbr
    });
    updateSeasonStatsModal({ headshot: player?.headshot || espnHeadshotUrl(player?.id) });
    await ensureSeasonData();
    if (!seasonData) return;
    selectedSeasonRow = findSeasonRow(player);
    updateSeasonStatsModal({
      row: selectedSeasonRow,
      team: String(
        clickedTeamAbbr ||
        selectedSeasonRow?.TEAM_ABBREVIATION ||
        selectedSeasonRow?.TEAM ||
        ''
      ).toUpperCase(),
      headers: filterSeasonHeaders(seasonData?.players?.headers ?? []),
      seasonLabel: seasonFromDate().replace('-', '/')
    });
    loadSeasonHistory(player);
  }
</script>

<div class="border border-white/10 rounded text-xs scroll-container stats-table-container">
  <div class="grid" style="grid-template-columns: {nameColWidth} 1fr">
    <div class="min-w-0">
      <div class="px-1 py-1 font-semibold text-left border-b-2 border-white/20">PLAYER</div>
      {#each displayRows as row, i}
        {#if i === 5}
          <div class="border-t-2 border-white/20"></div>
        {/if}
        <button
          type="button"
          class="border-t border-white/5 px-1 py-1 text-left truncate w-full hover:text-white/90"
          on:click={() => openSeasonModal(row)}
        >
          {row.displayName}
        </button>
      {/each}
      <div class="border-t-2 border-white/20 px-1 py-1 font-semibold text-left">TOTAL</div>
    </div>
  <div class="overflow-x-auto" data-scrollable="true" data-h-scroll>
      <div class="grid border-b-2 border-white/20" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
        {#each statCols as k}
          <div class="py-1 text-center font-semibold">{statLabels[k] ?? k}</div>
        {/each}
      </div>
      {#each displayRows as row, i}
        {#if i === 5}
          <div
            class="grid border-t-2 border-white/20"
            style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})"
          ></div>
        {/if}
        <div class="grid border-t border-white/5" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
          {#each row.statValues as value}
            <div class="py-1 text-center">{value ?? ''}</div>
          {/each}
        </div>
      {/each}
      <div class="grid border-t-2 border-white/20" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
        {#each statCols as k}
          <div class="py-1 text-center font-semibold">{totalsByKey[k] ?? ''}</div>
        {/each}
      </div>
    </div>
  </div>
</div>
