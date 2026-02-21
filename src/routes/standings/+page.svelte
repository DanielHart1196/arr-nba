<script lang="ts">
  import { goto } from '$app/navigation';
  import { getTeamLogoPath } from '$lib/utils/team.utils';

  type Row = {
    position: number;
    team: string;
    logo: string;
    wins: string;
    losses: string;
    pct: string;
    gb: string;
    streak: string;
  };

  type Group = {
    name: string;
    rows: Row[];
  };

  export let data: { standings: any; error: string | null };

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
          const logo = getTeamLogoPath(teamObj);
          return {
            position: 0,
            team,
            logo,
            wins: stats.wins ?? stats.W ?? '-',
            losses: stats.losses ?? stats.L ?? '-',
            pct: stats.winPercent ?? stats.PCT ?? '-',
            gb: stats.gamesBack ?? stats.GB ?? '-',
            streak: stats.streak ?? stats.STRK ?? '-'
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

  $: groups = parseGroups(data.standings);
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
    <h1 class="text-lg font-semibold">NBA Standings</h1>
    <div class="w-[64px]"></div>
  </div>

  {#if data.error}
    <div class="text-red-300">{data.error}</div>
  {:else if groups.length === 0}
    <div class="text-white/70">No standings data available.</div>
  {:else}
    <div class="space-y-4">
      {#each groups as group}
        <section class="rounded border border-white/10 overflow-hidden">
          <header class="px-3 py-2 bg-white/5 text-sm font-medium">{group.name}</header>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-white/5 text-white/70">
                <tr>
                  <th class="px-2 py-2 text-right w-8">#</th>
                  <th class="px-2 py-2 text-center w-10">Logo</th>
                  <th class="px-3 py-2 text-left">Team</th>
                  <th class="px-2 py-2 text-right">W</th>
                  <th class="px-2 py-2 text-right">L</th>
                  <th class="px-2 py-2 text-right">Pct</th>
                  <th class="px-2 py-2 text-right">GB</th>
                  <th class="px-3 py-2 text-right">Streak</th>
                </tr>
              </thead>
              <tbody>
                {#each group.rows as row}
                  <tr class="border-t border-white/10">
                    <td class="px-2 py-2 text-right text-white/80">{row.position}</td>
                    <td class="px-2 py-2">
                      <div class="mx-auto h-6 w-6 flex items-center justify-center">
                        {#if row.logo}
                          <img src={row.logo} alt={row.team} class="h-6 w-6 object-contain" loading="lazy" decoding="async" />
                        {/if}
                      </div>
                    </td>
                    <td class="px-3 py-2">{row.team}</td>
                    <td class="px-2 py-2 text-right">{row.wins}</td>
                    <td class="px-2 py-2 text-right">{row.losses}</td>
                    <td class="px-2 py-2 text-right">{row.pct}</td>
                    <td class="px-2 py-2 text-right">{row.gb}</td>
                    <td class="px-3 py-2 text-right">{row.streak}</td>
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
