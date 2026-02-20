import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import autoAdapter from '@sveltejs/adapter-auto';

const useLocalAdapter = process.env.LOCAL_BUILD === '1';

export default {
  kit: {
    adapter: useLocalAdapter ? autoAdapter() : cloudflareAdapter(),
    alias: {
      $lib: 'src/lib'
    }
  }
};
