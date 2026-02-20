import { expandTeamNames } from '../../../../lib/utils/team-matching.utils';

const NO_STORE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store'
};

export const GET = async ({ url }: any) => {
  const awayTeam = url.searchParams.get('away') || '';
  const homeTeam = url.searchParams.get('home') || '';
  const type = url.searchParams.get('type') || 'live';
  
  const expandedAway = expandTeamNames([awayTeam]);
  const expandedHome = expandTeamNames([homeTeam]);
  const allTeamNames = [...expandedAway, ...expandedHome];
  
  const base = type === 'post' ? '"POST GAME THREAD"' : '"GAME THREAD"';
  const extra = type === 'live' ? ' -"POST GAME THREAD"' : ' -"GAME THREAD"';
  const terms = allTeamNames.map(t => `"${t}"`).join(' OR ');
  const query = `${base} (${terms})${extra}`;
  
  return new Response(JSON.stringify({
    awayTeam,
    homeTeam,
    type,
    expandedAway,
    expandedHome,
    query
  }), {
    headers: NO_STORE_HEADERS
  });
};
