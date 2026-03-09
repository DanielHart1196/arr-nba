<script lang="ts">
  import { tick } from 'svelte';
  import { closeSeasonStatsModal, seasonStatsModal } from '../../stores/seasonStatsModal.store';
  import TeamLogo from '../TeamLogo.svelte';
  import { buildHeadshotFallbacks } from '$lib/utils/headshots';

  let headshotSrc = '';
  let fallbackIndex = 0;
  let visibleHistory: { season: string; row: Record<string, any> | null }[] = [];
  let modalHeaders: string[] = [];
  let playerTeamAbbr = '';
  let playerPosNum = '';
  let playerAgeTag = '';

  $: if ($seasonStatsModal.open) {
    fallbackIndex = 0;
    const fallbacks = headshotFallbacks();
    headshotSrc = fallbacks[0] ?? '';
  }

  function headshotFallbacks(): string[] {
    return buildHeadshotFallbacks($seasonStatsModal.playerId, $seasonStatsModal.headshot);
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
    if (upper === 'W-L') return 'W-L';
    if (upper === 'W_PCT') return 'W%';
    if (upper === 'FG3M') return '3PM';
    if (upper === 'FG3A') return '3PA';
    if (upper === 'FG_PCT') return 'FG';
    if (upper === 'FG3_PCT') return '3P';
    if (upper === 'FT_PCT') return 'FT';
    if (upper === 'TS_PCT') return 'TS';
    if (upper === 'EFG_PCT') return 'eFG';
    if (upper === 'USG_PCT') return 'USG';
    if (upper === 'AST_PCT') return 'AST%';
    if (upper === 'REB_PCT') return 'REB%';
    if (upper === 'OREB_PCT') return 'OREB%';
    if (upper === 'DREB_PCT') return 'DREB%';
    if (upper === 'TM_TOV_PCT') return 'TOV%';
    if (upper === 'OFF_RATING') return 'ORtg';
    if (upper === 'DEF_RATING') return 'DRtg';
    if (upper === 'NET_RATING') return 'NRtg';
    if (upper === 'BLKA') return 'BA';
    return String(header || '');
  }

  function normalizeHeaders(headers: string[]): string[] {
    if (!Array.isArray(headers)) return [];
    const upper = headers.map((h) => String(h || '').toUpperCase());
    const hasW = upper.includes('W');
    const hasL = upper.includes('L');
    if (!hasW || !hasL) return headers;
    const out: string[] = [];
    headers.forEach((h, idx) => {
      const key = upper[idx];
      if (key === 'L') return;
      if (key === 'W') {
        out.push('W-L');
        return;
      }
      out.push(h);
    });
    const minIndex = out.findIndex((h) => String(h || '').toUpperCase() === 'MIN');
    const ptsIndex = out.findIndex((h) => String(h || '').toUpperCase() === 'PTS');
    if (minIndex >= 0 && ptsIndex >= 0 && ptsIndex !== minIndex + 1) {
      const next = [...out];
      const [pts] = next.splice(ptsIndex, 1);
      next.splice(minIndex + 1, 0, pts);
      return next;
    }
    return out;
  }

  function columnWidth(header: string): string {
    const upper = String(header || '').toUpperCase();
    if (upper === 'AGE' || upper === 'GP') return '1.6rem';
    if (upper === 'W-L') return '2.8rem';
    return '2.25rem';
  }

  function formatModalValue(header: string, row: Record<string, any> | null): string {
    const upper = String(header || '').toUpperCase();
    if (upper === 'W-L') {
      const w = row?.W ?? '-';
      const l = row?.L ?? '-';
      return `${w}-${l}`;
    }
    return formatColumnValue(header, row?.[header]);
  }

  function formatSeasonLabel(season: string): string {
    return season ? season.replace('-', '/') : '';
  }

  function historyTeamLabel(row: Record<string, any> | null): string {
    if (!row) return '-';
    const abbr = String(row.TEAM_ABBREVIATION ?? '').trim();
    if (!abbr) return '-';
    return abbr;
  }

  function formatPct(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return `${Math.round(n * 100)}%`;
  }

  function trimHistory(rows: { season: string; row: Record<string, any> | null }[]): { season: string; row: Record<string, any> | null }[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return rows.filter((entry) => Boolean(entry?.row));
  }

  $: visibleHistory = trimHistory($seasonStatsModal.historyRows ?? []);
  $: modalHeaders = normalizeHeaders($seasonStatsModal.headers ?? []);
  $: {
    const fromPlayer = String($seasonStatsModal.player?.teamAbbr ?? '').trim().toUpperCase();
    const fromState = String($seasonStatsModal.team ?? '').trim().toUpperCase();
    playerTeamAbbr = fromPlayer || fromState || '';
  }
  $: playerPosNum = (() => {
    const position = String($seasonStatsModal.player?.position ?? '').trim();
    const jersey = String($seasonStatsModal.player?.jersey ?? '').trim();
    if (position && jersey) return `${position} · #${jersey}`;
    if (position) return position;
    if (jersey) return `#${jersey}`;
    return '';
  })();
  $: playerAgeTag = (() => {
    const raw = $seasonStatsModal.row?.AGE;
    if (raw === null || raw === undefined || raw === '') return '';
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    const years = Math.floor(n);
    const days = Math.round((n - years) * 365);
    if (days > 0) return `${years}y${days}d`;
    return `${years}y`;
  })();

  $: if ($seasonStatsModal.open) {
    tick();
  }
</script>

{#if $seasonStatsModal.open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" on:click={closeSeasonStatsModal}>
    <div
      class="w-full max-w-[92vw] min-w-0 overflow-hidden rounded-lg border border-white/15 bg-[#0e0e0e] shadow-xl max-h-[calc(90svh-2rem)] flex flex-col"
      style="max-width:92vw;"
      on:click|stopPropagation
    >
      <div class="relative p-4 pb-4 overflow-hidden flex flex-col gap-4 min-h-0 h-full">
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
          <div class="flex min-h-0 flex-1 flex-col gap-3">
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
                <div class="text-xs text-white/60 flex flex-col">
                  <div class="inline-flex items-center gap-1">
                    {#if playerTeamAbbr}
                      <span class="inline-flex items-center gap-1">
                        <TeamLogo abbr={playerTeamAbbr} className="h-3 w-3" alt={playerTeamAbbr} />
                        <span>{playerTeamAbbr}</span>
                      </span>
                    {/if}
                    {#if playerTeamAbbr && playerPosNum} · {/if}
                    {#if playerPosNum}{playerPosNum}{/if}
                  </div>
                  {#if $seasonStatsModal.seasonLabel || playerAgeTag}
                    <div>
                      {$seasonStatsModal.seasonLabel}
                      {#if $seasonStatsModal.seasonLabel && playerAgeTag} · {/if}
                      {playerAgeTag}
                    </div>
                  {/if}
                </div>
              </div>
            </div>

            {#if $seasonStatsModal.row}
              <div class="grid grid-cols-5 gap-2 text-xs text-white/80">
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">GP</div>
                  <div class="text-sm font-medium text-white">{$seasonStatsModal.row.GP ?? '-'}</div>
                </div>
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">MIN</div>
                  <div class="text-sm font-medium text-white">{$seasonStatsModal.row.MIN ?? '-'}</div>
                </div>
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">FG</div>
                  <div class="text-sm font-medium text-white">{formatPct($seasonStatsModal.row.FG_PCT)}</div>
                </div>
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">3P</div>
                  <div class="text-sm font-medium text-white">{formatPct($seasonStatsModal.row.FG3_PCT)}</div>
                </div>
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">FT</div>
                  <div class="text-sm font-medium text-white">{formatPct($seasonStatsModal.row.FT_PCT)}</div>
                </div>
              </div>
              <div class="grid grid-cols-5 gap-2 text-xs text-white/80">
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">PTS</div>
                  <div class="text-sm font-medium text-white">{$seasonStatsModal.row.PTS ?? '-'}</div>
                </div>
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">REB</div>
                  <div class="text-sm font-medium text-white">{$seasonStatsModal.row.REB ?? '-'}</div>
                </div>
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">AST</div>
                  <div class="text-sm font-medium text-white">{$seasonStatsModal.row.AST ?? '-'}</div>
                </div>
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">STL</div>
                  <div class="text-sm font-medium text-white">{$seasonStatsModal.row.STL ?? '-'}</div>
                </div>
                <div class="rounded border border-white/10 px-2 py-1">
                  <div class="text-[10px] text-white/60">BLK</div>
                  <div class="text-sm font-medium text-white">{$seasonStatsModal.row.BLK ?? '-'}</div>
                </div>
              </div>
              {#if $seasonStatsModal.headers?.length}
                <div class="border-t border-white/10 pt-3">
                  <div class="text-xs font-semibold text-white/70 mb-2">
                    {$seasonStatsModal.seasonLabel || 'Season Stats'}
                  </div>
                  <div class="relative rounded border border-white/10">
                    <div class="overflow-x-auto" data-h-scroll>
                      <div
                        class="grid text-[11px] text-white/80"
                        style="width:max-content; grid-template-columns: {modalHeaders.map((h) => columnWidth(h)).join(' ')}"
                      >
                        {#each modalHeaders as header}
                          <div class="py-1 text-center font-semibold border-b border-white/10 text-[10px]">
                            {displayHeader(header)}
                          </div>
                        {/each}
                        {#each modalHeaders as header}
                          <div class="py-1 text-center">{formatModalValue(header, $seasonStatsModal.row)}</div>
                        {/each}
                      </div>
                    </div>
                  </div>
                </div>
              {/if}
              <div class="border-t border-white/10 pt-3 min-h-0 flex-1 flex flex-col">
                <div class="text-xs font-semibold text-white/70 mb-2">Season History</div>
                {#if $seasonStatsModal.historyLoading}
                  <div class="text-xs text-white/60">Loading season history...</div>
                {:else if $seasonStatsModal.historyError}
                  <div class="text-xs text-red-300">{$seasonStatsModal.historyError}</div>
                {:else if visibleHistory.length}
                  {#key $seasonStatsModal.playerId}
                    <div
                      class="rounded border border-white/10 max-h-[32svh] overflow-auto pr-1 pb-2 scroll-container"
                      data-scrollable="true"
                      data-no-swipe="true"
                      style="touch-action: auto; -webkit-overflow-scrolling: touch;"
                    >
                      <div
                        class="grid text-[11px] text-white/80"
                        style="width:max-content; grid-template-columns: 3.25rem 2.5rem {modalHeaders.map((h) => columnWidth(h)).join(' ')}"
                      >
                        <div class="py-1 text-center font-semibold border-b border-white/10 text-[10px] bg-[#0e0e0e] sticky top-0 left-0 z-30">SEASON</div>
                        <div class="py-1 text-center font-semibold border-b border-white/10 text-[10px] bg-[#0e0e0e] sticky top-0 z-20">TEAM</div>
                        {#each modalHeaders as header}
                          <div class="py-1 text-center font-semibold border-b border-white/10 text-[10px] bg-[#0e0e0e] sticky top-0 z-20">
                            {displayHeader(header)}
                          </div>
                        {/each}
                        {#each visibleHistory as entry}
                          <div class="py-1 text-center text-[10px] text-white/60 bg-[#0e0e0e] sticky left-0 z-20">
                            {formatSeasonLabel(entry.season)}
                          </div>
                          <div class="py-1 text-center text-[10px] text-white/70 bg-[#0e0e0e]">
                            {historyTeamLabel(entry.row)}
                          </div>
                          {#each modalHeaders as header}
                            <div class="py-1 text-center">{formatModalValue(header, entry.row)}</div>
                          {/each}
                        {/each}
                      </div>
                    </div>
                  {/key}
                {:else}
                  <div class="text-xs text-white/60">No season history found.</div>
                {/if}
              </div>
            {:else}
              <div class="mt-4 text-xs text-white/60">Season stats not found for this player.</div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
