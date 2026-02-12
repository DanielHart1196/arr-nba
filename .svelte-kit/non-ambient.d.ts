
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/api" | "/api/boxscore" | "/api/boxscore/[eventId]" | "/api/reddit" | "/api/reddit/comments" | "/api/reddit/comments/[postId]" | "/api/reddit/index" | "/api/reddit/search" | "/api/scoreboard" | "/game" | "/game/[id]" | "/settings";
		RouteParams(): {
			"/api/boxscore/[eventId]": { eventId: string };
			"/api/reddit/comments/[postId]": { postId: string };
			"/game/[id]": { id: string }
		};
		LayoutParams(): {
			"/": { eventId?: string; postId?: string; id?: string };
			"/api": { eventId?: string; postId?: string };
			"/api/boxscore": { eventId?: string };
			"/api/boxscore/[eventId]": { eventId: string };
			"/api/reddit": { postId?: string };
			"/api/reddit/comments": { postId?: string };
			"/api/reddit/comments/[postId]": { postId: string };
			"/api/reddit/index": Record<string, never>;
			"/api/reddit/search": Record<string, never>;
			"/api/scoreboard": Record<string, never>;
			"/game": { id?: string };
			"/game/[id]": { id: string };
			"/settings": Record<string, never>
		};
		Pathname(): "/" | "/api" | "/api/" | "/api/boxscore" | "/api/boxscore/" | `/api/boxscore/${string}` & {} | `/api/boxscore/${string}/` & {} | "/api/reddit" | "/api/reddit/" | "/api/reddit/comments" | "/api/reddit/comments/" | `/api/reddit/comments/${string}` & {} | `/api/reddit/comments/${string}/` & {} | "/api/reddit/index" | "/api/reddit/index/" | "/api/reddit/search" | "/api/reddit/search/" | "/api/scoreboard" | "/api/scoreboard/" | "/game" | "/game/" | `/game/${string}` & {} | `/game/${string}/` & {} | "/settings" | "/settings/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/logos/ATL.svg" | "/logos/BKN.svg" | "/logos/BOS.svg" | "/logos/CHA.svg" | "/logos/CHI.svg" | "/logos/CLE.svg" | "/logos/DAL.svg" | "/logos/DEN.svg" | "/logos/DET.svg" | "/logos/GSW.svg" | "/logos/HOU.svg" | "/logos/IND.svg" | "/logos/LAC.svg" | "/logos/LAL.svg" | "/logos/MEM.svg" | "/logos/MIA.svg" | "/logos/MIL.svg" | "/logos/MIN.svg" | "/logos/NOP.svg" | "/logos/NYK.svg" | "/logos/OKC.svg" | "/logos/ORL.svg" | "/logos/PHI.svg" | "/logos/PHX.svg" | "/logos/POR.svg" | "/logos/SAC.svg" | "/logos/SAS.svg" | "/logos/TOR.svg" | "/logos/UTA.svg" | "/logos/WAS.svg" | string & {};
	}
}