import type { NBAService } from './nba.service';
import type { RedditPost } from '$lib/types/nba';
import { createPairKey } from '$lib/utils/reddit.utils';

export interface RedditThreadsForMatch {
  liveThread?: RedditPost;
  postThread?: RedditPost;
}

export async function resolveRedditThreadsForMatch(
  service: NBAService,
  awayName: string,
  homeName: string
): Promise<RedditThreadsForMatch> {
  if (!awayName || !homeName) return {};

  const pairKey = createPairKey(awayName, homeName);
  const mapping = await service.getRedditIndex();
  const entry = mapping?.[pairKey];

  let liveThread = entry?.gdt;
  let postThread = entry?.pgt;

  const searches: Promise<void>[] = [];

  if (!liveThread) {
    searches.push(
      service
        .searchRedditThread({
          type: 'live',
          awayCandidates: [awayName],
          homeCandidates: [homeName]
        })
        .then((result) => {
          if (result?.post) liveThread = result.post;
        })
        .catch(() => {})
    );
  }

  if (!postThread) {
    searches.push(
      service
        .searchRedditThread({
          type: 'post',
          awayCandidates: [awayName],
          homeCandidates: [homeName]
        })
        .then((result) => {
          if (result?.post) postThread = result.post;
        })
        .catch(() => {})
    );
  }

  if (searches.length > 0) {
    await Promise.allSettled(searches);
  }

  return { liveThread, postThread };
}

export async function prewarmRedditForMatch(
  service: NBAService,
  awayName: string,
  homeName: string
): Promise<void> {
  const { liveThread, postThread } = await resolveRedditThreadsForMatch(service, awayName, homeName);

  if (liveThread) {
    service.getRedditComments(liveThread.id, 'new', liveThread.permalink).catch(() => {});
  }
  if (postThread) {
    service.getRedditComments(postThread.id, 'top', postThread.permalink).catch(() => {});
  }
}

export async function refreshLiveRedditForMatch(
  service: NBAService,
  awayName: string,
  homeName: string
): Promise<void> {
  const { liveThread } = await resolveRedditThreadsForMatch(service, awayName, homeName);
  if (!liveThread) return;
  await service.getRedditComments(liveThread.id, 'new', liveThread.permalink, true);
}
