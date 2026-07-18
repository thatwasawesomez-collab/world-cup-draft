import { create } from 'zustand';

export type DraftType = 'untimed' | '2min' | '5min';

export interface Player {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Team {
  id: string;
  name: string;
  group: string;
  flagCode: string;
  fifaRanking: number;
}

export const TEAMS: Team[] = [
  // Group A
  { id: 'mx', name: 'Mexico', group: 'A', flagCode: 'mx', fifaRanking: 10 },
  { id: 'kr', name: 'South Korea', group: 'A', flagCode: 'kr', fifaRanking: 32 },
  { id: 'cz', name: 'Czechia', group: 'A', flagCode: 'cz', fifaRanking: 48 },
  { id: 'za', name: 'South Africa', group: 'A', flagCode: 'za', fifaRanking: 54 },

  // Group B
  { id: 'ch', name: 'Switzerland', group: 'B', flagCode: 'ch', fifaRanking: 14 },
  { id: 'ca', name: 'Canada', group: 'B', flagCode: 'ca', fifaRanking: 30 },
  { id: 'qa', name: 'Qatar', group: 'B', flagCode: 'qa', fifaRanking: 59 },
  { id: 'ba', name: 'Bosnia and Herzegovina', group: 'B', flagCode: 'ba', fifaRanking: 61 },

  // Group C
  { id: 'br', name: 'Brazil', group: 'C', flagCode: 'br', fifaRanking: 5 },
  { id: 'ma', name: 'Morocco', group: 'C', flagCode: 'ma', fifaRanking: 6 },
  { id: 'gb-sct', name: 'Scotland', group: 'C', flagCode: 'gb-sct', fifaRanking: 42 },
  { id: 'ht', name: 'Haiti', group: 'C', flagCode: 'ht', fifaRanking: 88 },

  // Group D
  { id: 'us', name: 'USA', group: 'D', flagCode: 'us', fifaRanking: 16 },
  { id: 'tr', name: 'Türkiye', group: 'D', flagCode: 'tr', fifaRanking: 27 },
  { id: 'au', name: 'Australia', group: 'D', flagCode: 'au', fifaRanking: 28 },
  { id: 'py', name: 'Paraguay', group: 'D', flagCode: 'py', fifaRanking: 34 },

  // Group E
  { id: 'de', name: 'Germany', group: 'E', flagCode: 'de', fifaRanking: 12 },
  { id: 'ec', name: 'Ecuador', group: 'E', flagCode: 'ec', fifaRanking: 25 },
  { id: 'ci', name: 'Ivory Coast', group: 'E', flagCode: 'ci', fifaRanking: 31 },
  { id: 'cw', name: 'Curaçao', group: 'E', flagCode: 'cw', fifaRanking: 82 },

  // Group F
  { id: 'nl', name: 'Netherlands', group: 'F', flagCode: 'nl', fifaRanking: 9 },
  { id: 'jp', name: 'Japan', group: 'F', flagCode: 'jp', fifaRanking: 17 },
  { id: 'se', name: 'Sweden', group: 'F', flagCode: 'se', fifaRanking: 37 },
  { id: 'tn', name: 'Tunisia', group: 'F', flagCode: 'tn', fifaRanking: 57 },

  // Group G
  { id: 'be', name: 'Belgium', group: 'G', flagCode: 'be', fifaRanking: 8 },
  { id: 'ir', name: 'Iran', group: 'G', flagCode: 'ir', fifaRanking: 22 },
  { id: 'eg', name: 'Egypt', group: 'G', flagCode: 'eg', fifaRanking: 24 },
  { id: 'nz', name: 'New Zealand', group: 'G', flagCode: 'nz', fifaRanking: 86 },

  // Group H
  { id: 'es', name: 'Spain', group: 'H', flagCode: 'es', fifaRanking: 2 },
  { id: 'uy', name: 'Uruguay', group: 'H', flagCode: 'uy', fifaRanking: 20 },
  { id: 'sa', name: 'Saudi Arabia', group: 'H', flagCode: 'sa', fifaRanking: 58 },
  { id: 'cv', name: 'Cape Verde', group: 'H', flagCode: 'cv', fifaRanking: 64 },

  // Group I
  { id: 'fr', name: 'France', group: 'I', flagCode: 'fr', fifaRanking: 3 },
  { id: 'sn', name: 'Senegal', group: 'I', flagCode: 'sn', fifaRanking: 18 },
  { id: 'no', name: 'Norway', group: 'I', flagCode: 'no', fifaRanking: 19 },
  { id: 'iq', name: 'Iraq', group: 'I', flagCode: 'iq', fifaRanking: 63 },

  // Group J
  { id: 'ar', name: 'Argentina', group: 'J', flagCode: 'ar', fifaRanking: 1 },
  { id: 'at', name: 'Austria', group: 'J', flagCode: 'at', fifaRanking: 23 },
  { id: 'dz', name: 'Algeria', group: 'J', flagCode: 'dz', fifaRanking: 29 },
  { id: 'jo', name: 'Jordan', group: 'J', flagCode: 'jo', fifaRanking: 73 },

  // Group K
  { id: 'pt', name: 'Portugal', group: 'K', flagCode: 'pt', fifaRanking: 7 },
  { id: 'co', name: 'Colombia', group: 'K', flagCode: 'co', fifaRanking: 11 },
  { id: 'cd', name: 'DR Congo', group: 'K', flagCode: 'cd', fifaRanking: 41 },
  { id: 'uz', name: 'Uzbekistan', group: 'K', flagCode: 'uz', fifaRanking: 60 },

  // Group L
  { id: 'gb-eng', name: 'England', group: 'L', flagCode: 'gb-eng', fifaRanking: 4 },
  { id: 'hr', name: 'Croatia', group: 'L', flagCode: 'hr', fifaRanking: 13 },
  { id: 'pa', name: 'Panama', group: 'L', flagCode: 'pa', fifaRanking: 44 },
  { id: 'gh', name: 'Ghana', group: 'L', flagCode: 'gh', fifaRanking: 65 },
];

export interface DraftPick {
  teamId: string;
  playerId: string;
  pickNumber: number;
}

interface LeagueState {
  leagueId: string | null;
  draftType: DraftType;
  maxPlayers: number;
  players: Player[];
  draftOrder: string[]; // array of player IDs in draft order
  picks: DraftPick[];
  
  createLeague: (id: string, maxPlayers?: number) => void;
  setMaxPlayers: (count: number) => void;
  setDraftType: (type: DraftType) => void;
  addPlayer: (player: Player) => void;
  setDraftOrder: (order: string[]) => void;
  makePick: (teamId: string, playerId: string) => void;
  reset: () => void;
}

export const useStore = create<LeagueState>((set) => ({
  leagueId: null,
  draftType: 'untimed',
  maxPlayers: 6,
  players: [],
  draftOrder: [],
  picks: [],
  
  createLeague: (id, maxPlayers = 6) => set({ leagueId: id, maxPlayers, players: [], draftOrder: [], picks: [], draftType: 'untimed' }),
  setMaxPlayers: (count) => set({ maxPlayers: count }),
  setDraftType: (type) => set({ draftType: type }),
  addPlayer: (player) => set((state) => ({ players: [...state.players, player] })),
  setDraftOrder: (order) => set({ draftOrder: order }),
  makePick: (teamId, playerId) => set((state) => ({
    picks: [...state.picks, { teamId, playerId, pickNumber: state.picks.length + 1 }]
  })),
  reset: () => set({ leagueId: null, players: [], draftOrder: [], picks: [], draftType: 'untimed', maxPlayers: 6 })
}));
