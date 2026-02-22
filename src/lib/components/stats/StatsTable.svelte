<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Player } from '../../types/nba';
  import { openSeasonStatsModal, seasonStatsModal, updateSeasonStatsModal } from '../../stores/seasonStatsModal.store';

  export let players: Player[];

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
    return id ? `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png` : '';
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
  const HISTORY_STATIC_KEY = 'arrnba:season-history-static:v1';
  let staticHistory: { seasons: { season: string; players: { perGame?: { headers?: string[]; rows: any[] }; totals?: { headers?: string[]; rows: any[] } } }[] } | null = null;

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

  async function ensureSeasonData(): Promise<void> {
    if (seasonData || seasonLoading) return;
    seasonError = '';
    const cached = typeof localStorage !== 'undefined' ? readSeasonCache() : null;
    if (cached?.data) {
      seasonData = cached.data;
      if (Date.now() - Number(cached.ts) < SEASON_CACHE_TTL_MS) return;
    }

    seasonLoading = true;
    updateSeasonStatsModal({ loading: true });
    try {
      const res = await fetch('/api/season-leaders');
      const json = await res.json();
      if (!res.ok || json?.error) {
        seasonError = json?.error ?? `Failed to load season stats (${res.status})`;
        seasonData = null;
        updateSeasonStatsModal({ error: seasonError, loading: false });
        return;
      }
      seasonData = json;
      if (typeof localStorage !== 'undefined') {
        writeSeasonCache(json);
      }
    } catch (e: any) {
      seasonError = e?.message ?? 'Failed to load season stats';
      seasonData = null;
      updateSeasonStatsModal({ error: seasonError });
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
        return upper === 'FG_PCT' || upper === 'FG3_PCT' || upper === 'FT_PCT';
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

  function readStaticHistory(): { seasons: { season: string; players: { perGame?: { headers?: string[]; rows: any[] }; totals?: { headers?: string[]; rows: any[] } } }[] } | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(HISTORY_STATIC_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.seasons)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeStaticHistory(data: { seasons: { season: string; players: { perGame?: { headers?: string[]; rows: any[] }; totals?: { headers?: string[]; rows: any[] } } }[] }): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(HISTORY_STATIC_KEY, JSON.stringify(data));
    } catch {
      // Ignore quota errors; still ok for this session.
    }
  }

  async function loadSeasonHistory(player: Player): Promise<void> {
    const playerId = player?.id ? String(player.id) : '';
    if (!playerId) return;
    const cached = historyCache.get(playerId);
    if (cached) {
      updateSeasonStatsModal({
        historyRows: cached.rows,
        headers: cached.headers,
        historyLoading: false,
        historyError: ''
      });
      return;
    }

    updateSeasonStatsModal({ historyLoading: true, historyError: '' });
    try {
      if (!staticHistory) {
        staticHistory = readStaticHistory();
      }
      if (!staticHistory) {
        const res = await fetch('/season-history.json');
        if (!res.ok) throw new Error(`Season history error: ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json?.seasons)) throw new Error('Season history data invalid');
        staticHistory = json;
        writeStaticHistory(json);
      }

      const rows: { season: string; row: Record<string, any> | null }[] = [];
      let headers: string[] = [];
      for (const entry of staticHistory.seasons) {
        const season = String(entry?.season ?? '');
        const players = entry?.players?.perGame ?? entry?.players ?? {};
        const seasonHeaders = filterSeasonHeaders(players?.headers ?? []);
        if (seasonHeaders.length > 0 && headers.length === 0) headers = seasonHeaders;
        const seasonRows = players?.rows ?? [];
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
      updateSeasonStatsModal({
        historyRows: computed.rows,
        headers: computed.headers,
        historyLoading: false,
        historyError: ''
      });
    } catch (e: any) {
      updateSeasonStatsModal({
        historyLoading: false,
        historyError: e?.message ?? 'Failed to load season history'
      });
    }
  }

  async function openSeasonModal(player: Player): Promise<void> {
    if (!player) return;
    selectedPlayer = player;
    selectedSeasonRow = null;
    modalOpen = true;
    openSeasonStatsModal(player);
    updateSeasonStatsModal({ headshot: player?.headshot || espnHeadshotUrl(player?.id) });
    await ensureSeasonData();
    if (!seasonData) return;
    selectedSeasonRow = findSeasonRow(player);
    updateSeasonStatsModal({
      row: selectedSeasonRow,
      headers: filterSeasonHeaders(seasonData?.players?.headers ?? [])
    });
    loadSeasonHistory(player);
  }
</script>

<div class="border border-white/10 rounded text-xs scroll-container stats-table-container">
  <div class="grid" style="grid-template-columns: {nameColWidth} 1fr">
    <div>
      <div class="px-1 py-1 font-semibold text-left border-b-2 border-white/20">PLAYER</div>
      {#each displayRows as row, i}
        {#if i === 5}
          <div class="border-t-2 border-white/20"></div>
        {/if}
        <button
          type="button"
          class="border-t border-white/5 px-1 py-1 text-left truncate hover:text-white/90"
          on:click={() => openSeasonModal(row)}
        >
          {row.displayName}
        </button>
      {/each}
      <div class="border-t-2 border-white/20 px-1 py-1 font-semibold text-left">TOTAL</div>
    </div>
    <div class="overflow-x-auto" data-scrollable="true">
      <div class="grid border-b-2 border-white/20" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
        {#each statCols as k}
          <div class="py-1 text-center font-semibold">{statLabels[k] ?? k}</div>
        {/each}
      </div>
      {#each displayRows as row, i}
        {#if i === 5}
          <div class="border-t-2 border-white/20"></div>
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
