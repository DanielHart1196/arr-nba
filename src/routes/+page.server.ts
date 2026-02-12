export const load = async ({ fetch }: any) => {
  const res = await fetch('/api/scoreboard');
  if (!res.ok) {
    return { events: [], error: `status ${res.status}` };
  }
  const json = await res.json();
  return { events: json?.events ?? [] };
};
