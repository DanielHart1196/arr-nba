import * as universal from '../entries/pages/_layout.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.CDstAhzO.js","_app/immutable/chunks/DYOR36WO.js","_app/immutable/chunks/B3tR_vzS.js","_app/immutable/chunks/CcCAcYtz.js","_app/immutable/chunks/C3p8M5LI.js"];
export const stylesheets = ["_app/immutable/assets/0.gg9BFtrg.css"];
export const fonts = [];
