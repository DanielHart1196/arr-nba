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
}

export interface BoxscoreResponse {
  id: string;
  eventDate?: string;
  boxscore?: any;
  players: {
    home: Player[];
    away: Player[];
  };
  names?: string[] | {
    home?: string;
    away?: string;
  };
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
}

export interface RedditSearchResponse {
  post?: RedditPost;
}
