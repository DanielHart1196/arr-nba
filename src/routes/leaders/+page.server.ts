import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const seasonParam = url.searchParams.get('season');
  const qs = seasonParam ? `?season=${encodeURIComponent(seasonParam)}` : '';
  try {
    const res = await fetch(`/api/season-leaders${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        data: null,
        error: data?.error ?? `Failed to load season leaders (${res.status})`
      };
    }
    return {
      data,
      error: data?.error ?? null
    };
  } catch (error: any) {
    return {
      data: null,
      error: error?.message ?? 'Failed to load season leaders'
    };
  }
};
