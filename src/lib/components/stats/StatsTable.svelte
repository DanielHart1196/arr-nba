<script lang="ts">
  import type { Player } from '../../types/nba';

  export let players: Player[];

  const statCols = [
    'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'OREB', 'DREB', 'FGM', 'FGA', 'FG%', '3PM', '3PA', '3P%', 'FTM', 'FTA', 'FT%', 'PF', 'TO', '+/-'
  ];
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
    displayName: formatName(row?.name ?? ''),
    statValues: statCols.map((key) => formatStat(row, key))
  }));
  $: totalsByKey = buildTotals(safePlayers);
  $: formattedLongest = Math.max(...displayRows.map((r) => r.displayName.length), 6);
  $: nameColWidth = `${Math.min(formattedLongest, 13)}ch`;
  $: statColWidth = '2.2rem';
</script>

<div class="border border-white/10 rounded text-xs scroll-container stats-table-container">
  <div class="grid" style="grid-template-columns: {nameColWidth} 1fr">
    <div>
      <div class="px-1 py-1 font-semibold text-left border-b-2 border-white/20">PLAYER</div>
      {#each displayRows as row, i}
        <div class="{i===5 ? 'border-t-2 border-white/20' : 'border-t border-white/5'} px-1 py-1 text-left truncate">{row.displayName}</div>
      {/each}
      <div class="border-t-2 border-white/20 px-1 py-1 font-semibold text-left">TOTAL</div>
    </div>
    <div class="overflow-x-auto" data-scrollable="true">
      <div class="grid border-b-2 border-white/20" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
        {#each statCols as k}
          <div class="py-1 text-center font-semibold">{k}</div>
        {/each}
      </div>
      {#each displayRows as row, i}
        <div class="grid {i===5 ? 'border-t-2 border-white/20' : 'border-t border-white/5'}" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
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
