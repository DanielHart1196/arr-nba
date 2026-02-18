<script lang="ts">
  import type { Team } from '../../types/nba';

  export let linescores: { home: { team: Team; periods: number[]; total: number }; away: { team: Team; periods: number[]; total: number } };

  function abbr(team: Team) {
    return team?.abbreviation || team?.shortDisplayName || (team?.displayName ? team.displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase() : '');
  }

  $: maxPeriods = Math.max(4, linescores?.home?.periods?.length ?? 0, linescores?.away?.periods?.length ?? 0);
  $: extraPeriods = Math.max(0, maxPeriods - 4);
  $: awayAb = abbr(linescores?.away?.team) || '';
  $: homeAb = abbr(linescores?.home?.team) || '';
  $: abLen = Math.max(awayAb.length, homeAb.length);
  $: lineNameColWidth = `${Math.min(Math.max(abLen, 3), 6)}ch`;
  $: gridCols = `${lineNameColWidth} 1fr repeat(4, 2.2rem) 2.2rem${extraPeriods>0?` repeat(${extraPeriods}, 2.2rem)`:''}`;
</script>

<div class="mb-2 border border-white/10 rounded text-xs swipe-area">
  <div class="grid" style="grid-template-columns: {gridCols}">
    <div class="sticky-col px-2 py-1 font-semibold text-left">TEAM</div>
    <div></div>
    {#each [1,2,3,4] as i}
      <div class="px-2 py-1 text-right font-semibold">Q{i}</div>
    {/each}
    <div class="px-2 py-1 text-right font-semibold">TOT</div>
    {#each Array(extraPeriods) as _, i}
      <div class="px-2 py-1 text-right font-semibold">OT{i+1}</div>
    {/each}
    <div class="sticky-col px-2 py-1 text-left">{abbr(linescores?.away?.team)}</div>
    <div></div>
    {#each [0,1,2,3] as i}
      <div class="px-2 py-1 text-right">{(linescores?.away?.periods?.[i] ?? '')}</div>
    {/each}
    <div class="px-2 py-1 text-right font-semibold">{linescores?.away?.total}</div>
    {#each Array(extraPeriods) as _, i}
      <div class="px-2 py-1 text-right">{(linescores?.away?.periods?.[i+4] ?? '')}</div>
    {/each}
    <div class="sticky-col px-2 py-1 text-left">{abbr(linescores?.home?.team)}</div>
    <div></div>
    {#each [0,1,2,3] as i}
      <div class="px-2 py-1 text-right">{(linescores?.home?.periods?.[i] ?? '')}</div>
    {/each}
    <div class="px-2 py-1 text-right font-semibold">{linescores?.home?.total}</div>
    {#each Array(extraPeriods) as _, i}
      <div class="px-2 py-1 text-right">{(linescores?.home?.periods?.[i+4] ?? '')}</div>
    {/each}
  </div>
</div>
