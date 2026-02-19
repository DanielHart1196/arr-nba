import * as server from '../entries/pages/_page.server.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/2.C-xhTvOC.js","_app/immutable/chunks/DYOR36WO.js","_app/immutable/chunks/B3tR_vzS.js","_app/immutable/chunks/CcCAcYtz.js","_app/immutable/chunks/9E4dF-An.js","_app/immutable/chunks/p0_JILK_.js","_app/immutable/chunks/LtqmgyD5.js","_app/immutable/chunks/Chkda7mK.js","_app/immutable/chunks/BZ-v3JAU.js","_app/immutable/chunks/BT9b3L6y.js","_app/immutable/chunks/ZdaZVQ5c.js","_app/immutable/chunks/DbUAflhX.js","_app/immutable/chunks/DVt25r4J.js"];
export const stylesheets = [];
export const fonts = [];
