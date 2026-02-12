import vercelAdapter from '@sveltejs/adapter-vercel';

export default {
  kit: {
    adapter: vercelAdapter(),
    alias: {
      $lib: 'src/lib'
    }
  }
};
