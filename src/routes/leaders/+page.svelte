<script lang="ts">
  import { goto } from '$app/navigation';

  export let data: { data: any; error: string | null };

  const stats = data?.data ?? {};
  const season = stats?.season ?? '';
  const players = stats?.players ?? { headers: [], rows: [] };
  const teams = stats?.teams ?? { headers: [], rows: [] };
  const playerColumns = Array.isArray(players?.headers) ? players.headers : [];
  const teamColumns = Array.isArray(teams?.headers) ? teams.headers : [];
  const playerRows = Array.isArray(players?.rows) ? players.rows : [];
  const teamRows = Array.isArray(teams?.rows) ? teams.rows : [];

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
    return String(value);
  }
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
    <h1 class="text-lg font-semibold">Season Leaders{season ? ` (${season})` : ''}</h1>
    <div class="w-[64px]"></div>
  </div>

  {#if data.error}
    <div class="text-red-300">{data.error}</div>
  {:else}
    <div class="space-y-4">
      <section class="rounded border border-white/10 overflow-hidden">
        <header class="px-3 py-2 bg-white/5 text-sm font-medium">Player Season Stats (Per Game)</header>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-white/5 text-white/70">
              <tr>
                {#each playerColumns as column}
                  <th class="px-3 py-2 text-left whitespace-nowrap">{column}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each playerRows as row}
                <tr class="border-t border-white/10">
                  {#each playerColumns as column}
                    <td class="px-3 py-2 whitespace-nowrap">{formatValue(row?.[column])}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded border border-white/10 overflow-hidden">
        <header class="px-3 py-2 bg-white/5 text-sm font-medium">Team Season Stats (Per Game)</header>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-white/5 text-white/70">
              <tr>
                {#each teamColumns as column}
                  <th class="px-3 py-2 text-left whitespace-nowrap">{column}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each teamRows as row}
                <tr class="border-t border-white/10">
                  {#each teamColumns as column}
                    <td class="px-3 py-2 whitespace-nowrap">{formatValue(row?.[column])}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  {/if}
</div>
