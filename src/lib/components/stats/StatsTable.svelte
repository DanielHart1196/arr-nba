<script lang="ts">
  import { getTeamLogoAbbr } from '../../utils/team.utils';
  import type { Player, Team } from '../../types/nba';

  export let players: Player[];

  const statCols = [
    'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'OREB', 'DREB', 'FGM', 'FGA', 'FG%', '3PM', '3PA', '3P%', 'FTM', 'FTA', 'FT%', 'PF', 'TO', '+/-'
  ];

  function getStat(row: Player, key: string) {
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

  function sumKey(key: string, _players: Player[]) {
    // We don't sum percentages directly
    if (key.includes('%')) return 0;

    return _players.reduce((t: number, r: Player) => {
      const v = Number(r?.stats?.[key] ?? 0);
      return t + (isNaN(v) ? 0 : v);
    }, 0);
  }

  function pct(m: number, a: number) {
    return a > 0 ? Math.round((m / a) * 100) : 0;
  }

  function totalFor(key: string, _players: Player[]) {
    if (key === 'MIN' || key === '+/-') return '';
    if (key === 'FG%') {
      const m = sumKey('FGM', _players);
      const a = sumKey('FGA', _players);
      return pct(m, a) + '%';
    }
    if (key === '3P%') {
      const m = sumKey('3PM', _players);
      const a = sumKey('3PA', _players);
      return pct(m, a) + '%';
    }
    if (key === 'FT%') {
      const m = sumKey('FTM', _players);
      const a = sumKey('FTA', _players);
      return pct(m, a) + '%';
    }
    return sumKey(key, _players);
  }

  $: formattedLongest = Math.max(...players.map((r: Player) => (formatName(r?.name ?? '').length)), 6);
  $: nameColWidth = `${Math.min(formattedLongest, 13)}ch`;
  $: statColWidth = '2.2rem';
</script>

<div class="border border-white/10 rounded text-xs scroll-container stats-table-container">
  <div class="grid" style="grid-template-columns: {nameColWidth} 1fr">
    <div>
      <div class="px-1 py-1 font-semibold text-left border-b-2 border-white/20">PLAYER</div>
      {#each players as row, i}
        <div class="{i===5 ? 'border-t-2 border-white/20' : 'border-t border-white/5'} px-1 py-1 text-left truncate">{formatName(row.name)}</div>
      {/each}
      <div class="border-t-2 border-white/20 px-1 py-1 font-semibold text-left">TOTAL</div>
    </div>
    <div class="overflow-x-auto" data-scrollable="true">
      <div class="grid border-b-2 border-white/20" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
        {#each statCols as k}
          <div class="py-1 text-center font-semibold">{k}</div>
        {/each}
      </div>
      {#each players as row, i}
        <div class="grid {i===5 ? 'border-t-2 border-white/20' : 'border-t border-white/5'}" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
          {#each statCols as k}
            <div class="py-1 text-center">{getStat(row, k)}</div>
          {/each}
        </div>
      {/each}
      <div class="grid border-t-2 border-white/20" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
        {#each statCols as k}
          <div class="py-1 text-center font-semibold">{totalFor(k, players)}</div>
        {/each}
      </div>
    </div>
  </div>
</div>
