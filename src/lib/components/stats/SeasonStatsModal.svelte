<script lang="ts">
  import { tick } from 'svelte';
  import { closeSeasonStatsModal, seasonStatsModal } from '../../stores/seasonStatsModal.store';

  let headshotSrc = '';
  let fallbackIndex = 0;

  $: if ($seasonStatsModal.open) {
    fallbackIndex = 0;
    const fallbacks = headshotFallbacks();
    headshotSrc = fallbacks[0] ?? '';
  }

  function headshotFallbacks(): string[] {
    const id = $seasonStatsModal.playerId;
    const list: string[] = [];
    if ($seasonStatsModal.headshot) list.push($seasonStatsModal.headshot);
    if (id) {
      list.push(`https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`);
      list.push(`https://a.espncdn.com/i/headshots/nba/players/full/${id}.jpg`);
      list.push(`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`);
    }
    return Array.from(new Set(list.filter(Boolean)));
  }

  function advanceHeadshot(): void {
    const fallbacks = headshotFallbacks();
    if (fallbackIndex + 1 >= fallbacks.length) {
      headshotSrc = '';
      return;
    }
    fallbackIndex += 1;
    headshotSrc = fallbacks[fallbackIndex] ?? '';
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
    return String(value);
  }

  function formatColumnValue(header: string, value: unknown): string {
    const upper = String(header || '').toUpperCase();
    if (value === null || value === undefined || value === '') return '-';
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric) && (upper.includes('PCT') || upper.endsWith('%'))) {
      return `${Math.round(numeric * 100)}%`;
    }
    return formatValue(value);
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

  function formatSeasonLabel(season: string): string {
    return season ? season.replace('-', '/') : '';
  }

  function formatTriplePct(row: Record<string, any> | null): string {
    if (!row) return '-';
    const fg = row.FG_PCT ? `${Math.round(row.FG_PCT * 100)}` : '-';
    const p3 = row.FG3_PCT ? `${Math.round(row.FG3_PCT * 100)}` : '-';
    const ft = row.FT_PCT ? `${Math.round(row.FT_PCT * 100)}` : '-';
    return `${fg}/${p3}/${ft}`;
  }

  function trimHistory(rows: { season: string; row: Record<string, any> | null }[]): { season: string; row: Record<string, any> | null }[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return rows.filter((entry) => Boolean(entry?.row));
  }

  $: visibleHistory = trimHistory($seasonStatsModal.historyRows ?? []);

  $: if ($seasonStatsModal.open) {
    tick();
  }
</script>

{#if $seasonStatsModal.open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" on:click={closeSeasonStatsModal}>
    <div
      class="w-full max-w-[92vw] min-w-0 overflow-hidden rounded-lg border border-white/15 bg-[#0e0e0e] shadow-xl max-h-[85vh] flex flex-col"
      style="max-width:92vw;"
      on:click|stopPropagation
    >
      <div class="relative p-4 pb-6 overflow-hidden flex flex-col gap-4 min-h-0">
        <button
          class="absolute right-3 top-3 text-white/60 hover:text-white text-sm"
          aria-label="Close"
          on:click={closeSeasonStatsModal}
        >
          ✕
        </button>
        {#if $seasonStatsModal.loading}
          <div class="text-sm text-white/70">Loading season stats...</div>
        {:else if $seasonStatsModal.error}
          <div class="text-sm text-red-300">{$seasonStatsModal.error}</div>
        {:else if $seasonStatsModal.player}
          <div class="flex items-center gap-3">
            {#if headshotSrc}
              <img
                src={headshotSrc}
                alt={$seasonStatsModal.player?.name}
                class="h-20 w-20 rounded bg-black/40 object-cover"
                loading="lazy"
                decoding="async"
                on:error={advanceHeadshot}
              />
            {/if}
            <div class="min-w-0">
              <div class="text-base font-semibold text-white truncate">{$seasonStatsModal.player.name}</div>
              <div class="text-xs text-white/60">
                {#if $seasonStatsModal.team}{$seasonStatsModal.team}{/if}
                {#if $seasonStatsModal.team && $seasonStatsModal.player.position} · {/if}
                {#if $seasonStatsModal.player.position}{$seasonStatsModal.player.position}{/if}
                {#if ($seasonStatsModal.team || $seasonStatsModal.player.position) && $seasonStatsModal.player.jersey} · {/if}
                {#if $seasonStatsModal.player.jersey}#{$seasonStatsModal.player.jersey}{/if}
                {#if ($seasonStatsModal.team || $seasonStatsModal.player.position || $seasonStatsModal.player.jersey) && $seasonStatsModal.seasonLabel} · {/if}
                {#if $seasonStatsModal.seasonLabel}{$seasonStatsModal.seasonLabel}{/if}
              </div>
            </div>
          </div>

          {#if $seasonStatsModal.row}
            <div class="grid grid-cols-2 gap-2 text-xs text-white/80">
              <div class="rounded border border-white/10 px-2 py-1">GP {$seasonStatsModal.row.GP ?? '-'}</div>
              <div class="rounded border border-white/10 px-2 py-1">MIN {$seasonStatsModal.row.MIN ?? '-'}</div>
              <div class="rounded border border-white/10 px-2 py-1">PTS {$seasonStatsModal.row.PTS ?? '-'}</div>
              <div class="rounded border border-white/10 px-2 py-1">REB {$seasonStatsModal.row.REB ?? '-'}</div>
              <div class="rounded border border-white/10 px-2 py-1">AST {$seasonStatsModal.row.AST ?? '-'}</div>
              <div class="rounded border border-white/10 px-2 py-1">STL {$seasonStatsModal.row.STL ?? '-'}</div>
              <div class="rounded border border-white/10 px-2 py-1">BLK {$seasonStatsModal.row.BLK ?? '-'}</div>
              <div class="rounded border border-white/10 px-2 py-1">% {formatTriplePct($seasonStatsModal.row)}</div>
            </div>
            {#if $seasonStatsModal.headers?.length}
              <div class="border-t border-white/10 pt-3">
                <div class="text-xs font-semibold text-white/70 mb-2">
                  {$seasonStatsModal.seasonLabel || 'Season Stats'}
                </div>
                <div class="relative rounded border border-white/10">
                  <div class="overflow-x-auto">
                    <div
                      class="grid text-[11px] text-white/80"
                      style="width:max-content; grid-template-columns: repeat({$seasonStatsModal.headers.length}, 2.25rem)"
                    >
                      {#each $seasonStatsModal.headers as header}
                        <div class="py-1 text-center font-semibold border-b border-white/10 text-[10px]">
                          {displayHeader(header)}
                        </div>
                      {/each}
                      {#each $seasonStatsModal.headers as header}
                        <div class="py-1 text-center">{formatColumnValue(header, $seasonStatsModal.row?.[header])}</div>
                      {/each}
                    </div>
                  </div>
                </div>
              </div>
            {/if}
            <div class="border-t border-white/10 pt-3">
              <div class="text-xs font-semibold text-white/70 mb-2">Season History</div>
              {#if $seasonStatsModal.historyLoading}
                <div class="text-xs text-white/60">Loading season history...</div>
              {:else if $seasonStatsModal.historyError}
                <div class="text-xs text-red-300">{$seasonStatsModal.historyError}</div>
              {:else if visibleHistory.length}
                {#key $seasonStatsModal.playerId}
                  <div class="rounded border border-white/10">
                    <div class="max-h-[26vh] overflow-auto">
                      <div
                        class="grid text-[11px] text-white/80"
                        style="width:max-content; grid-template-columns: 3.25rem repeat({$seasonStatsModal.headers.length}, 2.25rem)"
                      >
                        <div class="py-1 text-center font-semibold border-b border-white/10 text-[10px] bg-[#0e0e0e] sticky top-0 left-0 z-30">SEASON</div>
                        {#each $seasonStatsModal.headers as header}
                          <div class="py-1 text-center font-semibold border-b border-white/10 text-[10px] bg-[#0e0e0e] sticky top-0 z-20">
                            {displayHeader(header)}
                          </div>
                        {/each}
                        {#each visibleHistory as entry}
                          <div class="py-1 text-center text-[10px] text-white/60 bg-[#0e0e0e] sticky left-0 z-10">
                            {formatSeasonLabel(entry.season)}
                          </div>
                          {#each $seasonStatsModal.headers as header}
                            <div class="py-1 text-center">{formatColumnValue(header, entry.row?.[header])}</div>
                          {/each}
                        {/each}
                      </div>
                    </div>
                  </div>
                {/key}
              {:else}
                <div class="text-xs text-white/60">No season history found.</div>
              {/if}
            </div>
            <div class="h-4"></div>
          {:else}
            <div class="mt-4 text-xs text-white/60">Season stats not found for this player.</div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}
