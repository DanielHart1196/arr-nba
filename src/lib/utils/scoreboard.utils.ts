import type { Event } from '../types/nba';

export function toScoreboardDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

export function isEventOnDate(event: Event, targetDate: string): boolean {
  try {
    return new Date(event.date).toDateString() === targetDate;
  } catch {
    return false;
  }
}

export function mergeUniqueAndSortEvents(events: Event[]): Event[] {
  const unique = Array.from(new Map(events.map((event) => [event.id, event])).values());
  unique.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return unique;
}

export function getEventTeamDisplayNames(event: Event): { awayName: string; homeName: string } | null {
  const competitors = event?.competitions?.[0]?.competitors ?? [];
  const awayName = competitors.find((c) => c.homeAway === 'away')?.team?.displayName;
  const homeName = competitors.find((c) => c.homeAway === 'home')?.team?.displayName;
  if (!awayName || !homeName) return null;
  return { awayName, homeName };
}
