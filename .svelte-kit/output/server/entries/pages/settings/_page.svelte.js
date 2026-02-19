import { a as attr } from "../../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let clientId = "";
    let clientSecret = "";
    $$renderer2.push(`<div class="p-4"><h2 class="text-xl font-semibold mb-4">Settings</h2> <div class="max-w-md space-y-3"><div><label class="block text-sm mb-1" for="client-id">Reddit Client ID</label> <input id="client-id" class="w-full px-3 py-2 rounded bg-white/10 border border-white/10"${attr("value", clientId)}/></div> <div><label class="block text-sm mb-1" for="client-secret">Reddit Client Secret</label> <input id="client-secret" class="w-full px-3 py-2 rounded bg-white/10 border border-white/10"${attr("value", clientSecret)}/></div> <button class="px-4 py-2 rounded accent-bg text-black font-semibold">Save</button> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
