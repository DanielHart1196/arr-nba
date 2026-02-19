import vercelAdapter from '@sveltejs/adapter-vercel';
import autoAdapter from '@sveltejs/adapter-auto';

const useLocalAdapter = process.env.LOCAL_BUILD === '1';

export default {
  kit: {
    adapter: useLocalAdapter ? autoAdapter() : vercelAdapter(),
    alias: {
      $lib: 'src/lib'
    }
  }
};
