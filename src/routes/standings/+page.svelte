<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { nbaService } from '$lib/services/nba.service';
  import TeamLogo from '$lib/components/TeamLogo.svelte';
  import { getTeamLogoAbbr } from '$lib/utils/team.utils';

  type Row = {
    position: number;
    team: string;
    abbr: string;
    wl: string;
    pct: string;
    gb: string;
    l10: string;
    streak: string;
  };

  type Group = {
    name: string;
    rows: Row[];
  };

  export let data: { standings: any; error: string | null } = { standings: null, error: null };
  let standingsData: any = data?.standings ?? null;
  let pageError: string | null = data?.error ?? null;
  let menuOpen = false;
  let menuPanelEl: HTMLDivElement | null = null;
  let menuListenersActive = false;

  function toStatMap(stats: any[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const stat of Array.isArray(stats) ? stats : []) {
      const keys = [stat?.name, stat?.displayName, stat?.abbreviation].filter((v) => typeof v === 'string' && v.length > 0);
      const value = String(stat?.displayValue ?? stat?.value ?? '');
      for (const key of keys) out[key] = value;
    }
    return out;
  }

  function toNumber(value: string): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function parseGroups(payload: any): Group[] {
    const candidates = Array.isArray(payload?.children)
      ? payload.children
      : (Array.isArray(payload?.standings) ? payload.standings : []);

    const groups: Group[] = [];

    for (const group of candidates) {
      const entries = Array.isArray(group?.standings?.entries)
        ? group.standings.entries
        : (Array.isArray(group?.entries) ? group.entries : []);

      const rows = entries
        .map((entry: any) => {
          const stats = toStatMap(entry?.stats);
          const teamObj = entry?.team ?? {};
          const team = teamObj?.displayName ?? teamObj?.shortDisplayName ?? teamObj?.abbreviation ?? 'Team';
          const abbr = getTeamLogoAbbr(teamObj);
          const wins = stats.wins ?? stats.W ?? '-';
          const losses = stats.losses ?? stats.L ?? '-';
          const wl = wins !== '-' && losses !== '-' ? `${wins}-${losses}` : '-';
          return {
            position: 0,
            team,
            abbr,
            wl,
            pct: stats.winPercent ?? stats.PCT ?? '-',
            gb: stats.gamesBack ?? stats.GB ?? '-',
            l10:
              stats['Last Ten Games'] ??
              stats['Last Ten'] ??
              stats['Last 10'] ??
              stats.L10 ??
              stats.lastTenGames ??
              stats.lastTen ??
              '-',
            streak: stats.streak ?? stats.STRK ?? stats.STREAK ?? '-'
          } as Row;
        })
        .sort((a: Row, b: Row) => toNumber(b.pct) - toNumber(a.pct))
        .map((row: Row, index: number) => ({ ...row, position: index + 1 }));

      if (rows.length > 0) {
        groups.push({
          name: group?.name ?? group?.abbreviation ?? 'Standings',
          rows
        });
      }
    }

    return groups;
  }

  $: groups = parseGroups(standingsData);

  onMount(() => {
    if (standingsData || pageError) return;
    nbaService.getStandings(true)
      .then((standings) => {
        standingsData = standings;
      })
      .catch((error: any) => {
        pageError = error?.message ?? 'Failed to load standings';
      });
  });

  $: if (menuOpen) {
    addMenuOutsideListeners();
  } else {
    removeMenuOutsideListeners();
  }

  function navigateFromMenu(path: string) {
    menuOpen = false;
    requestAnimationFrame(() => {
      const target = new URL(path, window.location.origin);
      goto(path).catch(() => {
        window.location.href = target.toString();
      });
      setTimeout(() => {
        const current = window.location.pathname + window.location.search + window.location.hash;
        const desired = target.pathname + target.search + target.hash;
        if (current !== desired) {
          window.location.href = target.toString();
        }
      }, 350);
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

</script>

<div class="p-4 min-h-screen">
  <div class="flex items-center justify-between mb-4">
    <div class="w-[64px]"></div>
    <button type="button" class="flex-1 text-center text-lg font-semibold" on:click={toggleMenu}>NBA Standings</button>
    <div class="relative w-[64px] flex justify-end items-center">
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

  {#if pageError}
    <div class="text-red-300">{pageError}</div>
  {:else if groups.length === 0}
    <div class="text-white/70">No standings data available.</div>
  {:else}
    <div class="space-y-4">
      {#each groups as group}
        <section class="rounded border border-white/10 overflow-hidden">
          <header class="px-3 py-2 bg-white/5 text-sm font-medium">{group.name}</header>
          <div class="overflow-x-auto" data-h-scroll>
            <table class="w-full text-sm">
              <thead class="bg-white/5 text-white/70">
                <tr>
                  <th class="px-2 py-2 text-center w-8">#</th>
                  <th class="px-2 py-2 text-center w-10">Logo</th>
                  <th class="px-3 py-2 text-left">Team</th>
                  <th class="px-2 py-2 text-center w-14 whitespace-nowrap">W-L</th>
                  <th class="px-2 py-2 text-center">%</th>
                  <th class="px-2 py-2 text-center">GB</th>
                  <th class="px-2 py-2 text-center">L10</th>
                  <th class="px-3 py-2 text-center">S</th>
                </tr>
              </thead>
              <tbody>
                {#each group.rows as row}
                  <tr class="border-t border-white/10">
                    <td class="px-2 py-2 text-center text-white/80">{row.position}</td>
                    <td class="px-2 py-2">
                      <div class="mx-auto h-10 w-10 flex items-center justify-center overflow-hidden">
                        <TeamLogo abbr={row.abbr} className="h-9 w-9 object-contain" alt={row.team} />
                      </div>
                    </td>
                    <td class="px-3 py-2">{row.team}</td>
                    <td class="px-2 py-2 text-center whitespace-nowrap">{row.wl}</td>
                    <td class="px-2 py-2 text-center">{row.pct}</td>
                    <td class="px-2 py-2 text-center">{row.gb}</td>
                    <td class="px-2 py-2 text-center">{row.l10}</td>
                    <td class="px-3 py-2 text-center">{row.streak}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>
