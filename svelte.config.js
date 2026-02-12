import adapter from '@sveltejs/adapter-static';

const isGhPages = process.env.GH_PAGES === 'true';

export default {
  kit: {
    adapter: adapter({
      pages: 'docs',
      assets: 'docs',
      fallback: '404.html'
    }),
    paths: {
      base: isGhPages ? '/arr-nba' : ''
    },
    alias: {
      $lib: 'src/lib'
    },
    prerender: {
      entries: ['*']
    }
  }
};
