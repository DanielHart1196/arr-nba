import { w as slot } from "../../chunks/index.js";
function _layout($$renderer, $$props) {
  $$renderer.push(`<div class="min-h-screen bg-black text-white overflow-x-hidden"><!--[-->`);
  slot($$renderer, $$props, "default", {});
  $$renderer.push(`<!--]--></div>`);
}
export {
  _layout as default
};
