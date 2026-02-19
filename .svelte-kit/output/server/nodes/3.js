import * as server from '../entries/pages/game/_id_/_page.server.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/game/_id_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/game/[id]/+page.server.ts";
export const imports = ["_app/immutable/nodes/3.BDtFp_yK.js","_app/immutable/chunks/DYOR36WO.js","_app/immutable/chunks/B3tR_vzS.js","_app/immutable/chunks/CcCAcYtz.js","_app/immutable/chunks/9E4dF-An.js","_app/immutable/chunks/p0_JILK_.js","_app/immutable/chunks/LtqmgyD5.js","_app/immutable/chunks/Chkda7mK.js","_app/immutable/chunks/BT9b3L6y.js","_app/immutable/chunks/DbUAflhX.js","_app/immutable/chunks/DVt25r4J.js","_app/immutable/chunks/C3p8M5LI.js","_app/immutable/chunks/BZ-v3JAU.js"];
export const stylesheets = [];
export const fonts = [];
