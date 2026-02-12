<script>
  let clientId = '';
  let clientSecret = '';
  let saved = false;
  const KEY_ID = 'arrnba.clientId';
  const KEY_SECRET = 'arrnba.clientSecret';
  function load() {
    clientId = localStorage.getItem(KEY_ID) ?? '';
    clientSecret = localStorage.getItem(KEY_SECRET) ?? '';
  }
  function save() {
    localStorage.setItem(KEY_ID, clientId ?? '');
    localStorage.setItem(KEY_SECRET, clientSecret ?? '');
    saved = true;
    setTimeout(()=> saved=false, 1500);
  }
  load();
</script>

<div class="p-4">
  <h2 class="text-xl font-semibold mb-4">Settings</h2>
  <div class="max-w-md space-y-3">
    <div>
      <label class="block text-sm mb-1">Reddit Client ID</label>
      <input class="w-full px-3 py-2 rounded bg-white/10 border border-white/10" bind:value={clientId} />
    </div>
    <div>
      <label class="block text-sm mb-1">Reddit Client Secret</label>
      <input class="w-full px-3 py-2 rounded bg-white/10 border border-white/10" bind:value={clientSecret} />
    </div>
    <button class="px-4 py-2 rounded accent-bg text-black font-semibold" on:click={save}>Save</button>
    {#if saved}
      <div class="text-green-400 text-sm">Saved</div>
    {/if}
  </div>
</div>
