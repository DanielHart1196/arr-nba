<script lang="ts">
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import { onMount } from 'svelte';
  import SeasonStatsModal from '$lib/components/stats/SeasonStatsModal.svelte';
  import { openSeasonStatsModal, updateSeasonStatsModal } from '$lib/stores/seasonStatsModal.store';

  export let data: { data: any; error: string | null };

  const initialStats = data?.data ?? {};
  const currentSeason = seasonFromDate();
  let mode: 'player' | 'team' = 'player';
  let perMode: 'PerGame' | 'Totals' = 'PerGame';
  let season = currentSeason;
  let error: string | null = data?.error ?? null;
  let seasons: string[] = buildSeasonList();
  let historyPayload: { seasons: { season: string; players: { perGame?: { headers?: string[]; rows: any[] }; totals?: { headers?: string[]; rows: any[] } } }[] } | null = null;
  let teamsData: { headers?: string[]; rows: any[] } = initialStats?.teams ?? { headers: [], rows: [] };
  let playerRows: any[] = [];
  let playerRowsRaw: any[] = [];
  let currentPlayersByMode: Record<string, { headers?: string[]; rows: any[] } | null> = {};
  let playerColumns: string[] = [];
  let teamRows: any[] = [];
  let teamColumns: string[] = [];
  let sortKey = '';
  let sortDir: 'asc' | 'desc' = 'desc';
  let activeTeamFilter = '';
  let nameFilter = '';
  let playerSearchOpen = false;
  let playerSearchInput: HTMLInputElement | null = null;
  const seasonLeadersCache = new Map<string, any>();
  let menuOpen = false;
  let menuPanelEl: HTMLDivElement | null = null;
  let menuListenersActive = false;
  const perModeStatHeaders = new Set([
    'MIN',
    'FGM',
    'FGA',
    'FG3M',
    'FG3A',
    'FTM',
    'FTA',
    'OREB',
    'DREB',
    'REB',
    'AST',
    'STL',
    'BLK',
    'BLKA',
    'PTS',
    'TOV',
    'PF',
    'PFD',
    'PLUS_MINUS'
  ]);

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
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      const y = startYear - i;
      const end = String(y + 1).slice(-2);
      list.push(`${y}-${end}`);
    }
    return list.filter((s) => s !== currentSeason);
  }

  function formatName(n: string): string {
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

  function filterSeasonHeaders(headers: string[]): string[] {
    if (!Array.isArray(headers)) return [];
    const ageIndex = headers.indexOf('AGE');
    const fromAge = ageIndex >= 0 ? headers.slice(ageIndex) : headers;
    const filtered = fromAge.filter((h) => {
      const upper = String(h || '').toUpperCase();
      if (!upper) return false;
      if (upper.includes('RANK')) return false;
      if (upper.includes('FANTASY')) return false;
      if (upper.includes('PCT')) {
        return upper === 'FG_PCT' || upper === 'FG3_PCT' || upper === 'FT_PCT';
      }
      if (upper === 'TEAM_COUNT') return false;
      if (upper === 'PLAYER_NAME' || upper === 'PLAYER_ID' || upper === 'TEAM_ABBREVIATION') return false;
      return true;
    });
    return normalizeHeaders(filtered);
  }

  function displayHeader(header: string): string {
    const upper = String(header || '').toUpperCase();
    if (upper === 'PLUS_MINUS') return '+/-';
    if (upper === 'W-L') return 'W-L';
    if (upper === 'W_PCT') return 'W%';
    if (upper === 'FG3M') return '3PM';
    if (upper === 'FG3A') return '3PA';
    if (upper === 'FG_PCT') return 'FG';
    if (upper === 'FG3_PCT') return '3P';
    if (upper === 'FT_PCT') return 'FT';
    if (upper === 'OREB') return 'OR';
    if (upper === 'DREB') return 'DR';
    if (upper === 'BLKA') return 'BA';
    if (upper === 'BLKD') return 'BA';
    return String(header || '');
  }

  function formatValue(header: string, value: unknown, row?: Record<string, any> | null): string {
    const upper = String(header || '').toUpperCase();
    if (upper === 'W-L') {
      const w = row?.W ?? '-';
      const l = row?.L ?? '-';
      return `${w}-${l}`;
    }
    if (value === null || value === undefined) return '';
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric) && (upper.includes('PCT') || upper.endsWith('%'))) {
      return `${Math.round(numeric * 100)}%`;
    }
    if (perMode === 'Totals' && upper === 'MIN' && Number.isFinite(numeric)) {
      return String(Math.round(numeric));
    }
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
    return String(value);
  }

  function normalizeHeaders(headers: string[]): string[] {
    if (!Array.isArray(headers)) return [];
    const upper = headers.map((h) => String(h || '').toUpperCase());
    const hasW = upper.includes('W');
    const hasL = upper.includes('L');
    const combined: string[] = [];
    headers.forEach((h, idx) => {
      const key = upper[idx];
      if (key.includes('RANK')) return;
      if (key === 'TEAM_COUNT') return;
      if (key === 'L' && hasW) return;
      if (key === 'W' && hasL) {
        combined.push('W-L');
        return;
      }
      combined.push(h);
    });

    const minIndex = combined.findIndex((h) => String(h || '').toUpperCase() === 'MIN');
    const ptsIndex = combined.findIndex((h) => String(h || '').toUpperCase() === 'PTS');
    if (minIndex >= 0 && ptsIndex >= 0 && ptsIndex !== minIndex + 1) {
      const next = [...combined];
      const [pts] = next.splice(ptsIndex, 1);
      next.splice(minIndex + 1, 0, pts);
      return next;
    }
    return combined;
  }

  function sortRows(rows: any[], headers: string[]): any[] {
    if (!sortKey) return rows;
    const key = sortKey;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = key === 'W-L'
        ? Number(a?.W ?? 0) - Number(a?.L ?? 0)
        : a?.[key];
      const bv = key === 'W-L'
        ? Number(b?.W ?? 0) - Number(b?.L ?? 0)
        : b?.[key];
      const an = typeof av === 'number' ? av : Number(av);
      const bn = typeof bv === 'number' ? bv : Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
      const as = av === null || av === undefined ? '' : String(av);
      const bs = bv === null || bv === undefined ? '' : String(bv);
      return as.localeCompare(bs) * dir;
    });
  }

  function applyPlayerData(players: { headers?: string[]; rows: any[] } | null): void {
    const headers = filterSeasonHeaders(players?.headers ?? []);
    playerColumns = headers;
    const baseRows = players?.rows ?? [];
    playerRowsRaw = baseRows;
    const filtered = baseRows.filter((row) => {
      if (activeTeamFilter && teamAbbr(row) !== activeTeamFilter) return false;
      if (nameFilter) {
        const needle = normalizeName(nameFilter);
        if (needle && !normalizeName(playerName(row)).includes(needle)) return false;
      }
      return true;
    });
    playerRows = sortRows(filtered, headers);
  }

  function applyTeamData(teams: { headers?: string[]; rows: any[] } | null): void {
    const headers = Array.isArray(teams?.headers) ? teams.headers : [];
    const filtered = headers.filter((h) => String(h || '').toUpperCase() !== 'TEAM_ID');
    teamColumns = normalizeHeaders(filtered);
    teamRows = sortRows(teams?.rows ?? [], teamColumns);
  }

  async function loadSeason(seasonKey: string): Promise<void> {
    season = seasonKey;
    error = null;
    const apiCacheKey = `${seasonKey}:${perMode}`;
    if (seasonKey === currentSeason) {
      try {
        let json = seasonLeadersCache.get(apiCacheKey);
        if (!json) {
          const res = await fetch(`/api/season-leaders?season=${encodeURIComponent(seasonKey)}&perMode=${perMode}`);
          json = await res.json().catch(() => ({}));
          if (!res.ok || json?.error) throw new Error(json?.error ?? `Failed to load season leaders (${res.status})`);
          seasonLeadersCache.set(apiCacheKey, json);
        }
        applyPlayerData(json?.players ?? null);
        teamsData = json?.teams ?? { headers: [], rows: [] };
        applyTeamData(teamsData);
        currentPlayersByMode[perMode] = json?.players ?? null;
      } catch (e: any) {
        error = e?.message ?? 'Failed to load season leaders';
      }
      return;
    }
    if (!historyPayload) {
      try {
        const res = await fetch('/season-history.json');
        if (!res.ok) throw new Error(`Failed to load season history (${res.status})`);
        historyPayload = await res.json();
      } catch (e: any) {
        error = e?.message ?? 'Failed to load season history';
        return;
      }
    }
    const entry = historyPayload?.seasons?.find((s) => String(s?.season ?? '') === seasonKey);
    const playerBlock = perMode === 'Totals' ? entry?.players?.totals : entry?.players?.perGame;
    applyPlayerData(playerBlock ?? null);

    try {
      let json = seasonLeadersCache.get(apiCacheKey);
      if (!json) {
        const res = await fetch(`/api/season-leaders?season=${encodeURIComponent(seasonKey)}&perMode=${perMode}`);
        json = await res.json().catch(() => ({}));
        if (!res.ok || json?.error) throw new Error(json?.error ?? `Failed to load teams (${res.status})`);
        seasonLeadersCache.set(apiCacheKey, json);
      }
      teamsData = json?.teams ?? { headers: [], rows: [] };
      applyTeamData(teamsData);
    } catch (e: any) {
      error = e?.message ?? 'Failed to load teams';
    }
  }

  function setSort(key: string): void {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'desc';
    }
    if (mode === 'player') {
      playerRows = sortRows(playerRows, ['PLAYER_NAME', 'TEAM_ABBREVIATION', ...playerColumns]);
    } else {
      teamRows = sortRows(teamRows, teamColumns);
    }
  }

  function playerName(row: any): string {
    return String(row?.PLAYER_NAME ?? row?.PLAYER ?? row?.NAME ?? '').trim();
  }

  function teamAbbr(row: any): string {
    return String(row?.TEAM_ABBREVIATION ?? row?.TEAM ?? '').trim();
  }

  function teamHeaderLabel(header: string): string {
    return String(header || '').toUpperCase() === 'TEAM_NAME' ? 'TEAM' : displayHeader(header);
  }

  function toggleTeamFilter(row: any): void {
    const abbr = teamAbbr(row);
    if (!abbr) return;
    activeTeamFilter = activeTeamFilter === abbr ? '' : abbr;
    applyPlayerData({ headers: playerColumns, rows: playerRowsRaw });
  }

  async function togglePlayerSearch(): Promise<void> {
    if (playerSearchOpen) return;
    playerSearchOpen = true;
    await tick();
    playerSearchInput?.focus();
    playerSearchInput?.select();
  }

  function handlePlayerSearchInput(value: string): void {
    nameFilter = value;
    applyPlayerData({ headers: playerColumns, rows: playerRowsRaw });
  }

  function handlePlayerSearchBlur(): void {
    if (!playerSearchOpen) return;
    if (nameFilter.trim() !== '') return;
    playerSearchOpen = false;
  }

  function clearPlayerSearch(): void {
    nameFilter = '';
    applyPlayerData({ headers: playerColumns, rows: playerRowsRaw });
    playerSearchOpen = false;
  }

  function isPerModeStat(header: string): boolean {
    return perModeStatHeaders.has(String(header || '').toUpperCase());
  }

  function togglePerMode(): void {
    perMode = perMode === 'PerGame' ? 'Totals' : 'PerGame';
    loadSeason(season);
  }

  function handleColumnClick(column: string): void {
    setSort(column);
  }

  function handleStatCellClick(column: string): void {
    if (isPerModeStat(column)) {
      togglePerMode();
    }
  }

  function navigateFromMenu(path: string) {
    menuOpen = false;
    requestAnimationFrame(() => {
      goto(path);
    });
  }
  function toggleMenu(): void {
    menuOpen = !menuOpen;
  }

  function handleOutsideMenuEvent(event: Event): void {
    if (!menuOpen) return;
    const target = event.target as Node | null;
    if (menuPanelEl && target && menuPanelEl.contains(target)) return;
    menuOpen = false;
  }

  function addMenuOutsideListeners(): void {
    if (menuListenersActive || typeof window === 'undefined') return;
    menuListenersActive = true;
    window.addEventListener('pointerdown', handleOutsideMenuEvent, { capture: true, passive: true });
    window.addEventListener('wheel', handleOutsideMenuEvent, { capture: true, passive: true });
    window.addEventListener('touchstart', handleOutsideMenuEvent, { capture: true, passive: true });
  }

  function removeMenuOutsideListeners(): void {
    if (!menuListenersActive || typeof window === 'undefined') return;
    menuListenersActive = false;
    window.removeEventListener('pointerdown', handleOutsideMenuEvent, { capture: true });
    window.removeEventListener('wheel', handleOutsideMenuEvent, { capture: true });
    window.removeEventListener('touchstart', handleOutsideMenuEvent, { capture: true });
  }


  function espnHeadshotUrl(id?: string): string {
    return id ? `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png` : '';
  }

  function buildHistoryRows(playerRow: any): { season: string; row: Record<string, any> | null }[] {
    const playerId = String(playerRow?.PLAYER_ID ?? '');
    const playerNameValue = playerName(playerRow);
    const needle = normalizeName(playerNameValue);
    const rows: { season: string; row: Record<string, any> | null }[] = [];
    const entries = historyPayload?.seasons ?? [];
    for (const entry of entries) {
      const seasonKey = String(entry?.season ?? '');
      const seasonBlock = perMode === 'Totals' ? entry?.players?.totals : entry?.players?.perGame;
      const seasonRows = seasonBlock?.rows ?? [];
      const byId = playerId ? seasonRows.find((r: any) => String(r.PLAYER_ID ?? '') === playerId) : null;
      let row = byId ?? null;
      if (!row && needle) {
        row = seasonRows.find((r: any) => normalizeName(String(r.PLAYER_NAME ?? '')) === needle) ?? null;
      }
      rows.push({ season: seasonKey, row });
    }
    return rows;
  }

  const HISTORY_URL = '/season-history.json?v=3';

  async function ensureHistoryPayload(): Promise<void> {
    if (historyPayload) return;
    try {
      const res = await fetch(HISTORY_URL);
      if (!res.ok) throw new Error(`Failed to load season history (${res.status})`);
      historyPayload = await res.json();
      const fileSeasons = Array.isArray(historyPayload?.seasons)
        ? historyPayload.seasons.map((s: any) => String(s?.season ?? '')).filter(Boolean)
        : [];
      if (fileSeasons.length > 0) {
        seasons = fileSeasons.filter((s) => s !== currentSeason);
      }
    } catch (e: any) {
      error = e?.message ?? 'Failed to load season history';
    }
  }

  async function prefetchHistorySeasons(): Promise<void> {
    if (historyPayload) return;
    try {
      const res = await fetch(HISTORY_URL);
      if (!res.ok) return;
      historyPayload = await res.json();
      const fileSeasons = Array.isArray(historyPayload?.seasons)
        ? historyPayload.seasons.map((s: any) => String(s?.season ?? '')).filter(Boolean)
        : [];
      if (fileSeasons.length > 0) {
        seasons = fileSeasons.filter((s) => s !== currentSeason);
      }
    } catch {
      // ignore prefetch failures for dropdown
    }
  }

  onMount(() => {
    prefetchHistorySeasons().catch(() => {});
    addMenuOutsideListeners();
  });

  $: if (menuOpen) {
    addMenuOutsideListeners();
  } else {
    removeMenuOutsideListeners();
  }

  async function ensureCurrentPlayers(): Promise<void> {
    if (currentPlayersByMode[perMode]) return;
    try {
      const res = await fetch(`/api/season-leaders?season=${encodeURIComponent(currentSeason)}&perMode=${perMode}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) throw new Error(json?.error ?? `Failed to load season leaders (${res.status})`);
      currentPlayersByMode[perMode] = json?.players ?? null;
    } catch {
      // ignore; history will just omit current season
    }
  }

  async function openPlayerModal(row: any): Promise<void> {
    if (!row) return;
    await ensureHistoryPayload();
    if (season !== currentSeason) {
      await ensureCurrentPlayers();
    }
    const playerId = row?.PLAYER_ID ? String(row.PLAYER_ID) : '';
    const name = playerName(row);
    const player = {
      id: playerId,
      name,
      position: row?.PLAYER_POSITION ?? row?.POSITION ?? '',
      jersey: row?.JERSEY ?? ''
    };
    openSeasonStatsModal(player as any);
    const history = buildHistoryRows(row);
    let historyRows = history;
    if (season !== currentSeason && currentPlayersByMode[perMode]) {
      const currentRows = currentPlayersByMode[perMode]?.rows ?? [];
      const byId = playerId ? currentRows.find((r: any) => String(r.PLAYER_ID ?? '') === playerId) : null;
      let currentRow = byId ?? null;
      if (!currentRow && name) {
        const needle = normalizeName(name);
        currentRow = currentRows.find((r: any) => normalizeName(String(r.PLAYER_NAME ?? '')) === needle) ?? null;
      }
      if (currentRow) {
        historyRows = [{ season: currentSeason, row: currentRow }, ...history];
      }
    }

    updateSeasonStatsModal({
      headshot: row?.HEADSHOT_URL ?? espnHeadshotUrl(playerId),
      row,
      headers: playerColumns,
      historyLoading: false,
      historyError: '',
      historyRows,
      seasonLabel: season.replace('-', '/'),
      team: teamAbbr(row)
    });
  }

  applyPlayerData(initialStats?.players ?? null);
  applyTeamData(initialStats?.teams ?? null);
</script>

<div class="p-4 min-h-screen">
  <div class="flex items-center justify-between mb-4">
    <div class="w-[64px]"></div>
    <div class="flex-1 flex items-center justify-center">
      <h1 class="text-lg font-semibold cursor-pointer" on:click={toggleMenu}>Stats</h1>
    </div>
    <div class="relative w-[64px] flex justify-end items-center">
      <select
        class="h-8 rounded border border-white/15 bg-[#121212] px-2 text-sm"
        bind:value={season}
        on:change={() => loadSeason(season)}
      >
        <option value={currentSeason}>{currentSeason.replace('-', '/')}</option>
        {#each seasons as s}
          <option value={s}>{s.replace('-', '/')}</option>
        {/each}
      </select>
      {#if menuOpen}
        <div
          class="absolute right-0 top-10 z-[999] w-44 rounded border border-white/15 bg-[#121212] shadow-lg"
          bind:this={menuPanelEl}
        >
          <a
            href="/"
            class="block w-full px-3 py-2 text-left text-sm hover:bg-white/10"
            on:click|preventDefault={() => navigateFromMenu('/')}
          >
            Scoreboard
          </a>
          <a
            href="/standings"
            class="block w-full px-3 py-2 text-left text-sm hover:bg-white/10 border-t border-white/10"
            on:click|preventDefault={() => navigateFromMenu('/standings')}
          >
            Standings
          </a>
          <a
            href="/stats"
            class="block w-full px-3 py-2 text-left text-sm hover:bg-white/10 border-t border-white/10"
            on:click|preventDefault={() => navigateFromMenu('/stats')}
          >
            Stats
          </a>
        </div>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-2 gap-2 mb-4">
    <button
      class="w-full py-2 rounded font-semibold {mode === 'player' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}"
      on:click={() => (mode = 'player')}
    >
      PLAYER
    </button>
    <button
      class="w-full py-2 rounded font-semibold {mode === 'team' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}"
      on:click={() => (mode = 'team')}
    >
      TEAM
    </button>
  </div>

  {#if error}
    <div class="text-red-300">{error}</div>
  {:else}
    {#if mode === 'player'}
      <section class="rounded border border-white/10 overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]" data-h-scroll>
          <table class="w-full text-xs bg-black">
            <thead class="bg-[#0d0d0d] text-white/70 sticky top-0 z-20">
              <tr>
                <th
                  class="px-3 py-2 text-left whitespace-nowrap hover:text-white sticky left-0 z-30 bg-[#0d0d0d] {sortKey === 'PLAYER_NAME' ? 'text-white' : ''}"
                  on:click={togglePlayerSearch}
                >
                  {#if playerSearchOpen}
                    <input
                      bind:this={playerSearchInput}
                      type="search"
                      class="w-[13ch] max-w-[13ch] bg-black/40 border border-white/20 rounded px-1.5 py-0.5 text-[11px] text-white placeholder:text-white/40"
                      placeholder="Search"
                      value={nameFilter}
                      on:input={(e) => handlePlayerSearchInput((e.currentTarget as HTMLInputElement).value)}
                      on:blur={handlePlayerSearchBlur}
                    />
                  {:else}
                    <span>Player</span>
                  {/if}
                  <button
                    type="button"
                    class="ml-1 text-white/60 hover:text-white/90 {playerSearchOpen ? 'text-[14px]' : 'text-[10px]'}"
                    aria-label={playerSearchOpen ? 'Clear search' : 'Sort by player'}
                    on:click|stopPropagation={() => (playerSearchOpen ? clearPlayerSearch() : setSort('PLAYER_NAME'))}
                  >
                    {playerSearchOpen ? '×' : '↕'}
                  </button>
                </th>
                <th
                  class="px-2 py-2 text-center whitespace-nowrap cursor-pointer hover:text-white w-[3.5rem] bg-[#0d0d0d] {sortKey === 'TEAM_ABBREVIATION' ? 'text-white' : ''} {sortKey === 'TEAM_ABBREVIATION' ? (sortDir === 'asc' ? 'shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.9)]' : 'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)]') : ''}"
                  on:click={() => setSort('TEAM_ABBREVIATION')}
                >
                  {activeTeamFilter || 'Team'}
                </th>
                {#each playerColumns as column}
                  <th
                    class="px-1.5 py-2 text-center whitespace-nowrap cursor-pointer hover:text-white w-[2rem] bg-[#0d0d0d] {sortKey === column ? 'text-white' : ''} {sortKey === column ? (sortDir === 'asc' ? 'shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.9)]' : 'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)]') : ''}"
                  on:click={() => handleColumnClick(column)}
                  >
                    {displayHeader(column)}
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each playerRows as row}
                <tr class="border-t border-white/10">
                  <td class="pl-3 pr-0 py-2 whitespace-nowrap sticky left-0 bg-black z-10">
                    <button class="hover:text-white/90 truncate w-[13ch] max-w-[13ch] block text-left" on:click={() => openPlayerModal(row)}>
                      {formatName(playerName(row))}
                    </button>
                  </td>
                  <td class="px-2 py-2 whitespace-nowrap w-[3.5rem]">
                    <button class="hover:text-white/90" on:click={() => toggleTeamFilter(row)}>
                      {teamAbbr(row)}
                    </button>
                  </td>
                  {#each playerColumns as column}
                    <td
                      class="px-1.5 py-2 text-center whitespace-nowrap w-[2rem] {isPerModeStat(column) ? 'cursor-pointer hover:text-white' : ''}"
                      on:click={() => handleStatCellClick(column)}
                    >
                      {formatValue(column, row?.[column], row)}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {:else}
      <section class="rounded border border-white/10 overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]" data-h-scroll>
          <table class="w-full text-xs">
            <thead class="bg-[#0d0d0d] text-white/70 sticky top-0 z-20">
              <tr>
                {#each teamColumns as column}
                  <th
                    class="px-3 py-2 whitespace-nowrap cursor-pointer hover:text-white {sortKey === column ? 'text-white' : ''} {sortKey === column ? (sortDir === 'asc' ? 'shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.9)]' : 'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)]') : ''} {column === 'TEAM_NAME' ? 'text-left sticky left-0 z-10 bg-[#0d0d0d]' : 'text-center bg-[#0d0d0d]'}"
                    on:click={() => handleColumnClick(column)}
                  >
                    {teamHeaderLabel(column)}
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
                {#each teamRows as row}
                  <tr class="border-t border-white/10">
                    {#each teamColumns as column}
                      <td
                        class="px-3 py-2 whitespace-nowrap {column === 'TEAM_NAME' ? 'text-left sticky left-0 z-0 bg-black' : 'text-center'} {isPerModeStat(column) ? 'cursor-pointer hover:text-white' : ''}"
                        on:click={() => handleStatCellClick(column)}
                      >
                        {#if String(column || '').toUpperCase() === 'TEAM_NAME'}
                          {formatValue(column, row?.[column], row)}
                        {:else}
                          {formatValue(column, row?.[column], row)}
                        {/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  {/if}
</div>

<SeasonStatsModal />
