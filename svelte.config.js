import autoAdapter from '@sveltejs/adapter-auto';

export default {
  kit: {
    adapter: autoAdapter(),
    alias: {
      $lib: 'src/lib'
    }
  }
};
