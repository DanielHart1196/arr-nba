import autoAdapter from '@sveltejs/adapter-auto';
import staticAdapter from '@sveltejs/adapter-static';

const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

export default {
  kit: {
    adapter: isCapacitorBuild
      ? staticAdapter({
          pages: 'www',
          assets: 'www',
          fallback: 'index.html'
        })
      : autoAdapter(),
    alias: {
      $lib: 'src/lib'
    }
  }
};
