<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import SeasonStatsModal from '$lib/components/stats/SeasonStatsModal.svelte';
  import { openSeasonStatsModal, updateSeasonStatsModal } from '$lib/stores/seasonStatsModal.store';

  export let data: { data: any; error: string | null };

  const initialStats = data?.data ?? {};
  const currentSeason = seasonFromDate();
  let mode: 'player' | 'team' = 'player';
  let perMode: 'PerGame' | 'Totals' = 'PerGame';
  let season = currentSeason;
  let error: string | null = data?.error ?? null;
  let seasons: string[] = [];
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

  function seasonFromDate(date = new Date()): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const startYear = month >= 10 ? year : year - 1;
    const endYear = String(startYear + 1).slice(-2);
    return `${startYear}-${endYear}`;
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
    return fromAge.filter((h) => {
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
  }

  function displayHeader(header: string): string {
    const upper = String(header || '').toUpperCase();
    if (upper === 'PLUS_MINUS') return '+/-';
    if (upper === 'FG3M') return '3PM';
    if (upper === 'FG3A') return '3PA';
    if (upper === 'FG_PCT') return 'FG';
    if (upper === 'FG3_PCT') return '3P';
    if (upper === 'FT_PCT') return 'FT';
    return String(header || '');
  }

  function formatValue(header: string, value: unknown): string {
    if (value === null || value === undefined) return '';
    const upper = String(header || '').toUpperCase();
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

  function sortRows(rows: any[], headers: string[]): any[] {
    if (!sortKey) return rows;
    const key = sortKey;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a?.[key];
      const bv = b?.[key];
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
    const filtered = activeTeamFilter
      ? baseRows.filter((row) => teamAbbr(row) === activeTeamFilter)
      : baseRows;
    playerRows = sortRows(filtered, headers);
  }

  function applyTeamData(teams: { headers?: string[]; rows: any[] } | null): void {
    const headers = Array.isArray(teams?.headers) ? teams.headers : [];
    teamColumns = headers.filter((h) => String(h || '').toUpperCase() !== 'TEAM_ID');
    teamRows = sortRows(teams?.rows ?? [], teamColumns);
  }

  async function loadSeason(seasonKey: string): Promise<void> {
    season = seasonKey;
    error = null;
    if (seasonKey === currentSeason) {
      try {
        const res = await fetch(`/api/season-leaders?season=${encodeURIComponent(seasonKey)}&perMode=${perMode}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.error) throw new Error(json?.error ?? `Failed to load season leaders (${res.status})`);
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
      const res = await fetch(`/api/season-leaders?season=${encodeURIComponent(seasonKey)}&perMode=${perMode}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) throw new Error(json?.error ?? `Failed to load teams (${res.status})`);
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
    return String(header || '').toUpperCase() === 'TEAM_NAME' ? 'TEAM' : header;
  }

  function toggleTeamFilter(row: any): void {
    const abbr = teamAbbr(row);
    if (!abbr) return;
    activeTeamFilter = activeTeamFilter === abbr ? '' : abbr;
    applyPlayerData({ headers: playerColumns, rows: playerRowsRaw });
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

  async function ensureHistoryPayload(): Promise<void> {
    if (historyPayload) return;
    try {
      const res = await fetch('/season-history.json');
      if (!res.ok) throw new Error(`Failed to load season history (${res.status})`);
      historyPayload = await res.json();
      seasons = Array.isArray(historyPayload?.seasons)
        ? historyPayload.seasons.map((s: any) => String(s?.season ?? '')).filter(Boolean)
        : [];
    } catch (e: any) {
      error = e?.message ?? 'Failed to load season history';
    }
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

  onMount(async () => {
    applyPlayerData(initialStats?.players ?? null);
    applyTeamData(initialStats?.teams ?? null);
    try {
      const res = await fetch('/season-history.json');
      if (res.ok) {
        historyPayload = await res.json();
        seasons = Array.isArray(historyPayload?.seasons)
          ? historyPayload.seasons.map((s: any) => String(s?.season ?? '')).filter(Boolean)
          : [];
      }
    } catch {
      // ignore; dropdown will only show current season
    }
  });
</script>

<div class="p-4 min-h-screen">
  <div class="flex items-center justify-between mb-4">
    <button
      type="button"
      class="h-9 px-3 rounded border border-white/15 bg-white/5 hover:bg-white/10"
      on:click={() => goto('/')}
    >
      Back
    </button>
    <div class="flex items-center gap-2">
      <h1 class="text-lg font-semibold">Stats</h1>
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
    </div>
    <button
      type="button"
      class="h-9 px-3 rounded border border-white/15 bg-white/5 hover:bg-white/10 text-sm"
      on:click={() => { perMode = perMode === 'PerGame' ? 'Totals' : 'PerGame'; loadSeason(season); }}
    >
      {perMode === 'Totals' ? 'Totals' : 'Per Game'}
    </button>
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
        <div class="overflow-x-auto">
          <table class="w-full text-xs bg-black">
            <thead class="bg-white/5 text-white/70">
              <tr>
                <th
                  class="px-3 py-2 text-left whitespace-nowrap cursor-pointer hover:text-white sticky left-0 z-10 bg-[#0d0d0d] {sortKey === 'PLAYER_NAME' ? (sortDir === 'asc' ? 'underline' : 'overline') : ''}"
                  on:click={() => setSort('PLAYER_NAME')}
                >
                  Player
                </th>
                <th
                  class="px-3 py-2 text-center whitespace-nowrap cursor-pointer hover:text-white {sortKey === 'TEAM_ABBREVIATION' ? (sortDir === 'asc' ? 'underline' : 'overline') : ''}"
                  on:click={() => setSort('TEAM_ABBREVIATION')}
                >
                  Team
                </th>
                {#each playerColumns as column}
                  <th
                    class="px-1.5 py-2 text-center whitespace-nowrap cursor-pointer hover:text-white w-[2rem] {sortKey === column ? (sortDir === 'asc' ? 'underline' : 'overline') : ''}"
                    on:click={() => setSort(column)}
                  >
                    {displayHeader(column)}
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each playerRows as row}
                <tr class="border-t border-white/10">
                  <td class="px-3 py-2 whitespace-nowrap sticky left-0 bg-black z-0">
                    <button class="hover:text-white/90 truncate w-[13ch] max-w-[13ch] block text-left" on:click={() => openPlayerModal(row)}>
                      {formatName(playerName(row))}
                    </button>
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <button class="hover:text-white/90" on:click={() => toggleTeamFilter(row)}>
                      {teamAbbr(row)}
                    </button>
                  </td>
                  {#each playerColumns as column}
                    <td class="px-1.5 py-2 text-center whitespace-nowrap w-[2rem]">{formatValue(column, row?.[column])}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {:else}
      <section class="rounded border border-white/10 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-white/5 text-white/70">
              <tr>
                {#each teamColumns as column}
                  <th
                    class="px-3 py-2 text-left whitespace-nowrap cursor-pointer hover:text-white {sortKey === column ? (sortDir === 'asc' ? 'underline' : 'overline') : ''} {column === 'TEAM_NAME' ? 'sticky left-0 z-10 bg-black' : ''}"
                    on:click={() => setSort(column)}
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
                      <td class="px-3 py-2 whitespace-nowrap {column === 'TEAM_NAME' ? 'sticky left-0 z-0 bg-black' : ''}">{formatValue(column, row?.[column])}</td>
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
