// src/games/catalog/games.catalog.ts

export type GameKind = 'SLOT' | 'CRASH' | 'DICE';

export type GameCatalogItem = {
  id: string;                 // gameCode
  name: string;               // nom marketing
  kind: GameKind;
  rtp: number;
  volatility?: 'LOW' | 'MEDIUM' | 'HIGH';

  // UI metadata (utilisé par game-server)
  ui: {
    aspectRatio: '16:9' | '4:3' | '9:16';
    width: number;
    height: number;
  };

  // IMPORTANT: chaque jeu a ses assets indépendants
  assets: {
    cover: string;            // image de sélection (tile)
    background?: string;      // background
    symbolsDir?: string;      // dossier des symboles (si SLOT)
  };
};

export const GAMES_CATALOG: Record<string, GameCatalogItem> = {
  fruit_classic: {
    id: 'fruit_classic',
    name: 'Fruit Classic',
    kind: 'SLOT',
    rtp: 0.96,
    volatility: 'MEDIUM',
    ui: { aspectRatio: '16:9', width: 1280, height: 720 },
    assets: {
      cover: '/assets/fruit_classic/cover.jpg',
      background: '/assets/fruit_classic/background.jpg',
      symbolsDir: '/assets/fruit_classic/symbols',
    },
  },

  egypt_riches: {
    id: 'egypt_riches',
    name: 'Egypt Riches',
    kind: 'SLOT',
    rtp: 0.96,
    volatility: 'MEDIUM',
    ui: { aspectRatio: '16:9', width: 1280, height: 720 },
    assets: {
      cover: '/assets/egypt_riches/cover.jpg',
      background: '/assets/egypt_riches/background.jpg',
      symbolsDir: '/assets/egypt_riches/symbols',
    },
  },

  jungle_wild: {
    id: 'jungle_wild',
    name: 'Jungle Wild',
    kind: 'SLOT',
    rtp: 0.96,
    volatility: 'MEDIUM',
    ui: { aspectRatio: '16:9', width: 1280, height: 720 },
    assets: {
      cover: '/assets/jungle_wild/cover.jpg',
      background: '/assets/jungle_wild/background.jpg',
      symbolsDir: '/assets/jungle_wild/symbols',
    },
  },

  luxury_gold: {
    id: 'luxury_gold',
    name: 'Luxury Gold',
    kind: 'SLOT',
    rtp: 0.96,
    volatility: 'MEDIUM',
    ui: { aspectRatio: '16:9', width: 1280, height: 720 },
    assets: {
      cover: '/assets/luxury_gold/cover.jpg',
      background: '/assets/luxury_gold/background.jpg',
      symbolsDir: '/assets/luxury_gold/symbols',
    },
  },

  diamond_rush: {
    id: 'diamond_rush',
    name: 'Diamond Rush',
    kind: 'SLOT',
    rtp: 0.96,
    volatility: 'MEDIUM',
    ui: { aspectRatio: '16:9', width: 1280, height: 720 },
    assets: {
      cover: '/assets/diamond_rush/cover.jpg',
      background: '/assets/diamond_rush/background.jpg',
      symbolsDir: '/assets/diamond_rush/symbols',
    },
  },

  fire_reels: {
    id: 'fire_reels',
    name: 'Fire Reels',
    kind: 'SLOT',
    rtp: 0.96,
    volatility: 'MEDIUM',
    ui: { aspectRatio: '16:9', width: 1280, height: 720 },
    assets: {
      cover: '/assets/fire_reels/cover.jpg',
      background: '/assets/fire_reels/background.jpg',
      symbolsDir: '/assets/fire_reels/symbols',
    },
  },

  mystic_fortune: {
    id: 'mystic_fortune',
    name: 'Mystic Fortune',
    kind: 'SLOT',
    rtp: 0.96,
    volatility: 'MEDIUM',
    ui: { aspectRatio: '16:9', width: 1280, height: 720 },
    assets: {
      cover: '/assets/mystic_fortune/cover.jpg',
      background: '/assets/mystic_fortune/background.jpg',
      symbolsDir: '/assets/mystic_fortune/symbols',
    },
  },

  crash_multiplier: {
    id: 'crash_multiplier',
    name: 'Crash Multiplier',
    kind: 'CRASH',
    rtp: 0.97,
    ui: { aspectRatio: '16:9', width: 1280, height: 720 },
    assets: {
      cover: '/assets/crash_multiplier/cover.jpg',
      background: '/assets/crash_multiplier/background.jpg',
    },
  },

  dice_over_under: {
    id: 'dice_over_under',
    name: 'Dice Over/Under',
    kind: 'DICE',
    rtp: 0.99,
    ui: { aspectRatio: '16:9', width: 1280, height: 720 },
    assets: {
      cover: '/assets/dice_over_under/cover.jpg',
      background: '/assets/dice_over_under/background.jpg',
    },
  },
};

export function getCatalogList(): GameCatalogItem[] {
  return Object.values(GAMES_CATALOG);
}

export function mustGetCatalogItem(gameCode: string): GameCatalogItem {
  const item = GAMES_CATALOG[(gameCode || '').trim()];
  if (!item) throw new Error(`Unknown gameCode in catalog: ${gameCode}`);
  return item;
}
