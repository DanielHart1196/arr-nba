import * as server from '../entries/pages/_page.server.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/2.CLkHXeKY.js","_app/immutable/chunks/DVUZdbEl.js","_app/immutable/chunks/mOB0g_sz.js","_app/immutable/chunks/D8ZGW8jb.js","_app/immutable/chunks/BV6NFH77.js","_app/immutable/chunks/Dk1Swlgz.js","_app/immutable/chunks/Dmu6a9U4.js","_app/immutable/chunks/DYJ-5WiK.js","_app/immutable/chunks/ChMNwxDu.js","_app/immutable/chunks/WbGyEyQw.js","_app/immutable/chunks/DlvNiFL_.js","_app/immutable/chunks/DCl0DeTE.js","_app/immutable/chunks/CN7CQmFo.js"];
export const stylesheets = [];
export const fonts = [];
