<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatTimeAgo } from '../utils/reddit.utils';
  import type { RedditComment } from '../types/nba';

  export let comment: RedditComment;
  export let depth = 0;

  const dispatch = createEventDispatcher<{ toggle: { id: string } }>();

  type BodyToken = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };
  type ParsedBody = { lines: BodyToken[][]; media: string[] };

  const IMAGE_EXT_RE = /\.(png|jpe?g|webp|avif|bmp|svg)(\?.*)?$/i;
  const GIF_EXT_RE = /\.gif(\?.*)?$/i;
  const VIDEO_EXT_RE = /\.(mp4|webm|mov)(\?.*)?$/i;
  const URL_RE = /https?:\/\/[^\s<]+/gi;
  const MARKDOWN_LINK_RE = /(!)?\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;

  $: parsed = parseBody(comment?.body ?? '');

  function requestToggle(event?: Event): void {
    event?.stopPropagation();
    if (!comment?.id) return;
    dispatch('toggle', { id: comment.id });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    requestToggle(event);
  }

  function stripTrailingPunctuation(raw: string): { clean: string; trailing: string } {
    let clean = raw;
    let trailing = '';
    while (clean.length > 0 && /[),.!?:;]/.test(clean[clean.length - 1])) {
      trailing = clean[clean.length - 1] + trailing;
      clean = clean.slice(0, -1);
    }
    return { clean, trailing };
  }

  function decodeHtmlEntities(value: string): string {
    if (!value) return '';
    const named: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' '
    };
    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_m, entity: string) => {
      const key = String(entity || '').toLowerCase();
      if (key.startsWith('#x')) {
        const cp = Number.parseInt(key.slice(2), 16);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
      }
      if (key.startsWith('#')) {
        const cp = Number.parseInt(key.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
      }
      return named[key] ?? _m;
    });
  }

  function normalizeUrl(raw: string): string {
    const decoded = decodeHtmlEntities((raw || '').trim());
    if (!decoded) return '';
    try {
      const parsed = new URL(decoded);
      const isRedditMedia = parsed.hostname.toLowerCase().includes('reddit.com') && parsed.pathname === '/media';
      if (isRedditMedia) {
        const wrapped = parsed.searchParams.get('url');
        if (wrapped) return decodeHtmlEntities(wrapped);
      }
      return parsed.toString();
    } catch {
      return decoded;
    }
  }

  function tokenizePlainTextWithLinks(text: string): BodyToken[] {
    const out: BodyToken[] = [];
    let last = 0;
    URL_RE.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = URL_RE.exec(text)) !== null) {
      if (match.index > last) out.push({ kind: 'text', text: text.slice(last, match.index) });
      const parsedUrl = stripTrailingPunctuation(match[0]);
      if (parsedUrl.clean) {
        const href = normalizeUrl(parsedUrl.clean);
        out.push({ kind: 'link', text: href || parsedUrl.clean, href: href || parsedUrl.clean });
      }
      if (parsedUrl.trailing) out.push({ kind: 'text', text: parsedUrl.trailing });
      last = match.index + match[0].length;
    }
    if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
    return out;
  }

  function isEmbeddableMediaUrl(url: string): boolean {
    return IMAGE_EXT_RE.test(url) || GIF_EXT_RE.test(url) || VIDEO_EXT_RE.test(url);
  }

  function parseBody(body: string): ParsedBody {
    const mediaSet = new Set<string>();
    const lines: BodyToken[][] = [];
    const decodedBody = decodeHtmlEntities(body || '');
    for (const line of decodedBody.split('\n')) {
      const tokens: BodyToken[] = [];
      let last = 0;
      MARKDOWN_LINK_RE.lastIndex = 0;
      let match: RegExpExecArray | null = null;
      while ((match = MARKDOWN_LINK_RE.exec(line)) !== null) {
        if (match.index > last) {
          tokens.push(...tokenizePlainTextWithLinks(line.slice(last, match.index)));
        }
        const isImageSyntax = Boolean(match[1]);
        const href = normalizeUrl(match[3]);
        const label = decodeHtmlEntities(match[2] || href || match[3]);
        tokens.push({ kind: 'link', text: label, href });
        if (isImageSyntax || isEmbeddableMediaUrl(href)) mediaSet.add(href);
        last = match.index + match[0].length;
      }
      if (last < line.length) {
        tokens.push(...tokenizePlainTextWithLinks(line.slice(last)));
      }
      for (const token of tokens) {
        if (token.kind === 'link' && isEmbeddableMediaUrl(token.href)) mediaSet.add(token.href);
      }
      lines.push(tokens);
    }
    return { lines, media: [...mediaSet] };
  }
</script>

<div
  role="button"
  tabindex="0"
  class="w-full text-left cursor-pointer"
  on:click={requestToggle}
  on:keydown={handleKeydown}
>
  <div class="text-sm text-white/70">
    {comment.author} • {comment.score} • {formatTimeAgo(comment.created_utc)} {comment._collapsed ? '• collapsed' : ''}
  </div>
  {#if !comment._collapsed}
    <div class="mt-1 break-words">
      {#each parsed.lines as tokens, lineIndex}
        {#each tokens as token, tokenIndex (`${lineIndex}-${tokenIndex}`)}
          {#if token.kind === 'link'}
            <a
              href={token.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="text-sky-300 hover:text-sky-200 underline break-all"
              on:click|stopPropagation
            >
              {token.text}
            </a>
          {:else}
            <span>{token.text}</span>
          {/if}
        {/each}
        {#if lineIndex < parsed.lines.length - 1}<br />{/if}
      {/each}
    </div>
    {#if parsed.media.length > 0}
      <div class="mt-2 space-y-2">
        {#each parsed.media as mediaUrl (mediaUrl)}
          {#if VIDEO_EXT_RE.test(mediaUrl)}
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="inline-block text-sky-300 hover:text-sky-200 underline break-all"
              on:click|stopPropagation
            >
              Open video
            </a>
          {:else}
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="inline-block"
              on:click|stopPropagation
            >
              <img
                class="max-h-80 w-auto max-w-full rounded border border-white/10 object-contain"
                src={mediaUrl}
                alt="Comment media"
                loading="lazy"
                decoding="async"
              />
            </a>
          {/if}
        {/each}
      </div>
    {/if}
    {#if comment.replies && comment.replies.length}
      <div class="mt-2 pl-3 border-l border-white/10 space-y-2">
        {#each comment.replies as reply, i (reply.id || `${depth}-${i}`)}
          <svelte:self comment={reply} depth={depth + 1} on:toggle />
        {/each}
      </div>
    {/if}
  {/if}
</div>
