export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.png","logos/ATL.svg","logos/BKN.svg","logos/BOS.svg","logos/CHA.svg","logos/CHI.svg","logos/CLE.svg","logos/DAL.svg","logos/DEN.svg","logos/DET.svg","logos/GSW.svg","logos/HOU.svg","logos/IND.svg","logos/LAC.svg","logos/LAL.svg","logos/MEM.svg","logos/MIA.svg","logos/MIL.svg","logos/MIN.svg","logos/NOP.svg","logos/NYK.svg","logos/OKC.svg","logos/ORL.svg","logos/PHI.svg","logos/PHX.svg","logos/POR.svg","logos/SAC.svg","logos/SAS.svg","logos/TOR.svg","logos/UTA.svg","logos/WAS.svg"]),
	mimeTypes: {".png":"image/png",".svg":"image/svg+xml"},
	_: {
		client: {start:"_app/immutable/entry/start.BPzrFRFN.js",app:"_app/immutable/entry/app.DQzzaj8c.js",imports:["_app/immutable/entry/start.BPzrFRFN.js","_app/immutable/chunks/Btvf1Y34.js","_app/immutable/chunks/mOB0g_sz.js","_app/immutable/chunks/BV6NFH77.js","_app/immutable/entry/app.DQzzaj8c.js","_app/immutable/chunks/mOB0g_sz.js","_app/immutable/chunks/Dk1Swlgz.js","_app/immutable/chunks/Dmu6a9U4.js","_app/immutable/chunks/DVUZdbEl.js","_app/immutable/chunks/BV6NFH77.js","_app/immutable/chunks/DYJ-5WiK.js","_app/immutable/chunks/DlvNiFL_.js","_app/immutable/chunks/CN7CQmFo.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js')),
			__memo(() => import('../output/server/nodes/3.js')),
			__memo(() => import('../output/server/nodes/4.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/api/boxscore/[eventId]",
				pattern: /^\/api\/boxscore\/([^/]+?)\/?$/,
				params: [{"name":"eventId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/boxscore/_eventId_/_server.ts.js'))
			},
			{
				id: "/api/reddit/comments/[postId]",
				pattern: /^\/api\/reddit\/comments\/([^/]+?)\/?$/,
				params: [{"name":"postId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/reddit/comments/_postId_/_server.ts.js'))
			},
			{
				id: "/api/reddit/debug",
				pattern: /^\/api\/reddit\/debug\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/reddit/debug/_server.ts.js'))
			},
			{
				id: "/api/reddit/debug/index",
				pattern: /^\/api\/reddit\/debug\/index\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/reddit/debug/index/_server.ts.js'))
			},
			{
				id: "/api/reddit/index",
				pattern: /^\/api\/reddit\/index\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/reddit/index/_server.ts.js'))
			},
			{
				id: "/api/reddit/index/fallback",
				pattern: /^\/api\/reddit\/index\/fallback\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/reddit/index/fallback/_server.ts.js'))
			},
			{
				id: "/api/reddit/proxy",
				pattern: /^\/api\/reddit\/proxy\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/reddit/proxy/_server.ts.js'))
			},
			{
				id: "/api/reddit/search",
				pattern: /^\/api\/reddit\/search\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/reddit/search/_server.ts.js'))
			},
			{
				id: "/api/reddit/subreddit/[subreddit]",
				pattern: /^\/api\/reddit\/subreddit\/([^/]+?)\/?$/,
				params: [{"name":"subreddit","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/reddit/subreddit/_subreddit_/_server.ts.js'))
			},
			{
				id: "/api/scoreboard",
				pattern: /^\/api\/scoreboard\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/scoreboard/_server.ts.js'))
			},
			{
				id: "/game/[id]",
				pattern: /^\/game\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/settings",
				pattern: /^\/settings\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
