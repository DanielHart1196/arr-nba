import autoAdapter from '@sveltejs/adapter-auto';
import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import staticAdapter from '@sveltejs/adapter-static';

const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';
const isCloudflarePages = Boolean(process.env.CF_PAGES || process.env.CF_PAGES_URL);

export default {
  kit: {
    adapter: isCapacitorBuild
      ? staticAdapter({
          pages: 'www',
          assets: 'www',
          fallback: 'index.html'
        })
      : (isCloudflarePages ? cloudflareAdapter() : autoAdapter()),
    alias: {
      $lib: 'src/lib'
    }
  }
};
