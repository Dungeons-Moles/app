import { PublicKey } from '@solana/web3.js';

// POI Type Constants (L1-L14)
export const POI_TYPES = {
  MOLE_DEN: 1, // L1 - Rest (heal HP)
  SUPPLY_CACHE: 2, // L2 - Pick item (choose 1 of 3)
  TOOL_CRATE: 3, // L3 - Pick item (choose 1 of 3)
  TOOL_OIL_RACK: 4, // L4 - Apply tool oil modification
  REST_ALCOVE: 5, // L5 - Rest (heal HP)
  SURVEY_BEACON: 6, // L6 - Reveal tiles in radius
  SEISMIC_SCANNER: 7, // L7 - Reveal nearest POI of category
  RAIL_WAYPOINT: 8, // L8 - Discover/fast travel
  SMUGGLER_HATCH: 9, // L9 - Shop (buy/reroll items)
  RUSTY_ANVIL: 10, // L10 - Upgrade item tier (costs gold)
  RUNE_KILN: 11, // L11 - Fuse two items
  GEODE_VAULT: 12, // L12 - Pick item (choose 1 of 3)
  COUNTER_CACHE: 13, // L13 - Pick item (choose 1 of 3)
  SCRAP_CHUTE: 14, // L14 - Scrap gear for gold
} as const;

export type PoiType = (typeof POI_TYPES)[keyof typeof POI_TYPES];

// POI Instance (on-chain)
export interface PoiInstance {
  poiType: number;
  x: number;
  y: number;
  used: boolean;
  discovered: boolean;
  weekSpawned: number;
}

// Shop State
export interface ShopState {
  poiIndex: number;
  offers: ItemOffer[];
  rerollCount: number;
  active: boolean;
  rngState: bigint;
}

export interface ItemOffer {
  itemId: Uint8Array; // 8 bytes
  tier: number;
  price: number;
  purchased: boolean;
}

// Individual offer item from on-chain CacheOffer
export interface OfferItem {
  itemId: number[]; // 8 bytes
  rarity: number;
  tier: number; // Item tier (0=Tier I, 1=Tier II, 2=Tier III)
}

// Cache offer for pick-item POIs (matches on-chain CacheOffer struct)
export interface CacheOffer {
  poiIndex: number;
  items: OfferItem[];
  generatedAtSeed: bigint;
}

// Oil offer for Tool Oil Rack POI (matches on-chain OilOffer struct)
export interface OilOffer {
  poiIndex: number;
  oils: number[]; // 3 oil flags (0x01=ATK, 0x02=SPD, 0x04=DIG, 0x08=ARM)
  generatedAtSeed: bigint;
}

// Scanner offer for Seismic Scanner POI (matches on-chain ScannerOffer struct)
export interface ScannerOffer {
  poiIndex: number;
  count: number;
  poiTypes: number[];
  generatedAtSeed: bigint;
}

// Map POIs account data
export interface MapPoisData {
  session: PublicKey;
  bump: number;
  count: number;
  act: number;
  week: number;
  seed: bigint;
  pois: PoiInstance[];
  shopState: ShopState;
  cacheOffers: CacheOffer[];
  oilOffers: OilOffer[];
  scannerOffers: ScannerOffer[];
}

// Account interfaces for POI instructions
export interface PoiBaseAccounts {
  mapPois: PublicKey;
  gameState: PublicKey;
  player: PublicKey;
}

export interface PoiHealAccounts extends PoiBaseAccounts {
  inventory: PublicKey;
  poiAuthority: PublicKey;
  gameplayStateProgram: PublicKey;
}

export interface PoiGoldAccounts extends PoiBaseAccounts {
  poiAuthority: PublicKey;
  gameplayStateProgram: PublicKey;
}

// POI interaction state machine
export type PoiInteractionState = 'idle' | 'choosing' | 'confirming' | 'complete';
