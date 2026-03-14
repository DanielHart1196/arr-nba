<script lang="ts">
  import type { Team } from '$lib/utils/team.utils';
  import { getTeamLogoAbbr, getTeamLogoPathByAbbr, getTeamLogoScaleStyleByAbbr, normalizeTeamAbbr } from '$lib/utils/team.utils';

  export let abbr: string = '';
  export let team: Team | null = null;
  export let className = 'h-4 w-4';
  export let baseScale = 1;
  export let alt = '';
  export let loading: 'lazy' | 'eager' = 'lazy';
  export let decoding: 'async' | 'sync' | 'auto' = 'async';

  $: resolvedAbbr = abbr ? normalizeTeamAbbr(abbr) : (team ? getTeamLogoAbbr(team) : '');
  $: src = resolvedAbbr ? getTeamLogoPathByAbbr(resolvedAbbr) : '';
  $: label = alt || '';
</script>

{#if src}
  <img
    src={src}
    alt={label}
    class={`object-contain ${className}`}
    style={getTeamLogoScaleStyleByAbbr(resolvedAbbr, baseScale)}
    loading={loading}
    decoding={decoding}
  />
{/if}
