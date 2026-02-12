let adapterMod;
try {
  adapterMod = await import('@sveltejs/adapter-auto');
} catch {}

export default {
  kit: {
    adapter: adapterMod ? adapterMod.default() : undefined,
    alias: {
      $lib: 'src/lib'
    }
  }
};
