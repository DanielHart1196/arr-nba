export function buildHeadshotFallbacks(playerId?: string, preferred?: string): string[] {
  const id = String(playerId ?? '').trim();
  const urls: string[] = [];

  if (preferred) urls.push(preferred);

  if (id) {
    // Local-first: include packaged app assets when available.
    urls.push(`/headshots/${id}.png`);
    urls.push(`/headshots/${id}.jpg`);
    urls.push(`/headshots/${id}.webp`);

    // Remote fallbacks for players not bundled locally.
    urls.push(`https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`);
    urls.push(`https://a.espncdn.com/i/headshots/nba/players/full/${id}.jpg`);
    urls.push(`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`);
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

export function preferredHeadshotUrl(playerId?: string): string {
  const list = buildHeadshotFallbacks(playerId);
  return list[0] ?? '';
}

