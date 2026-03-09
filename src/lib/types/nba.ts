export interface Team {
  id?: string;
  abbreviation?: string;
  shortDisplayName?: string;
  displayName?: string;
  homeAway?: 'home' | 'away';
}

export interface Competition {
  competitors: Competitor[];
  status: Status;
  id?: string;
}

export interface Competitor {
  team: Team;
  homeAway: 'home' | 'away';
  score?: number;
  linescores?: Linescore[];
}

export interface Linescore {
  value: number;
}

export interface Status {
  type: {
    description: string;
    shortDetail?: string;
    name?: string;
  };
  clock?: string;
  period?: number;
  short?: string;
  name?: string;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  competitions: Competition[];
}

export interface ScoreboardResponse {
  events: Event[];
}

export interface Player {
  name: string;
  stats: Record<string, number | string>;
  dnp?: boolean;
  id?: string;
  jersey?: string;
  position?: string;
  headshot?: string;
  teamAbbr?: string;
}

export interface PlayByPlayEntry {
  id: string;
  text: string;
  short?: string;
  awayScore?: number | string;
  homeScore?: number | string;
  period?: number | string;
  clock?: string;
  scoringPlay?: boolean;
  teamAbbr?: string;
}

export interface BoxscoreResponse {
  id: string;
  eventDate?: string;
  boxscore?: any;
  highlights?: {
    label: string;
    url: string;
    mode?: 'auto' | 'video' | 'embed';
  }[];
  players: {
    home: Player[];
    away: Player[];
  };
  names?: string[] | {
    home?: string;
    away?: string;
  };
  plays?: PlayByPlayEntry[];
  linescores: {
    home: {
      team: Team;
      periods: number[];
      total: number;
    };
    away: {
      team: Team;
      periods: number[];
      total: number;
    };
  };
  status?: {
    name?: string;
    short?: string;
    clock?: string;
    period?: number;
  };
  error?: string;
}

export interface RedditPost {
  id: string;
  title: string;
  url?: string;
  permalink?: string;
  score?: number;
  created_utc?: number;
}

export interface RedditComment {
  id: string;
  author: string;
  author_flair_text?: string;
  author_flair_text_color?: string;
  author_flair_background_color?: string;
  author_flair_richtext?: Array<{ e?: string; t?: string; u?: string }>;
  body: string;
  score: number;
  created_utc: number;
  replies?: RedditComment[];
  _collapsed?: boolean;
}

export interface RedditThreadMapping {
  [pairKey: string]: {
    gdt?: RedditPost; // Game Day Thread
    pgt?: RedditPost; // Post Game Thread
  };
}

export interface RedditSearchRequest {
  type: 'live' | 'post';
  awayCandidates: string[];
  homeCandidates: string[];
  eventDate?: string;
  eventId?: string;
  // Override time windows (seconds relative to event start).
  window?: {
    live?: [number, number];
    post?: [number, number];
  };
}

export interface RedditSearchDiagnostics {
  type: 'live' | 'post';
  eventDate?: string;
  windowSeconds: [number, number];
  counts: {
    total: number;
    inWindow: number;
    modeMatch: number;
    strictMatch: number;
    finalPool: number;
  };
  selected?: {
    id?: string;
    title?: string;
    created_utc?: number;
  } | null;
  samples: {
    inWindow: Array<{ id?: string; title?: string; created_utc?: number }>;
    modeMatch: Array<{ id?: string; title?: string; created_utc?: number }>;
    strictMatch: Array<{ id?: string; title?: string; created_utc?: number }>;
  };
}

export interface RedditSearchResponse {
  post?: RedditPost;
  diagnostics?: RedditSearchDiagnostics;
}
