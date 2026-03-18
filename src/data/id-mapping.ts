/**
 * ID Mapping between Frontend and Solana Backend
 *
 * Frontend uses: T0-T16 for tools, I1-I64 for gear
 * Backend uses: T-XX-NN for tools, G-XX-NN for gear (8-byte null-terminated)
 *
 * This mapping layer enables interoperability between systems.
 */

import type { ToolId, GearId } from '../game/engine/types';

// ============================================================================
// Tool ID Mapping (17 tools)
// ============================================================================

export const TOOL_FRONTEND_TO_BACKEND: Record<ToolId, string> = {
  T0: 'T-XX-00', // Basic Pickaxe (starter)
  T1: 'T-ST-01', // Bulwark Shovel (Stone)
  T2: 'T-ST-02', // Cragbreaker Hammer (Stone)
  T3: 'T-SC-01', // Twin Picks (Scout)
  T4: 'T-SC-02', // Pneumatic Drill (Scout)
  T5: 'T-GR-01', // Glittering Pick (Greed)
  T6: 'T-GR-02', // Gemfinder Staff (Greed)
  T7: 'T-BL-01', // Fuse Pick (Blast)
  T8: 'T-BL-02', // Spark Pick (Blast)
  T9: 'T-FR-01', // Rime Pike (Frost)
  T10: 'T-FR-02', // Glacier Fang (Frost)
  T11: 'T-RU-01', // Corrosive Pick (Rust)
  T12: 'T-RU-02', // Etched Burrowblade (Rust)
  T13: 'T-BO-01', // Serrated Drill (Blood)
  T14: 'T-BO-02', // Reaper Pick (Blood)
  T15: 'T-TE-01', // Quickpick (Tempo)
  T16: 'T-TE-02', // Chrono Rapier (Tempo)
};

export const TOOL_BACKEND_TO_FRONTEND: Record<string, ToolId> = Object.fromEntries(
  Object.entries(TOOL_FRONTEND_TO_BACKEND).map(([k, v]) => [v, k as ToolId])
);

// ============================================================================
// Gear ID Mapping (64 gear items)
// ============================================================================

export const GEAR_FRONTEND_TO_BACKEND: Record<GearId, string> = {
  // STONE (8): I1-I8 -> G-ST-01 to G-ST-08
  I1: 'G-ST-01', // Miner Helmet
  I2: 'G-ST-02', // Work Vest
  I3: 'G-ST-03', // Spiked Bracers
  I4: 'G-ST-04', // Reinforcement Plate
  I5: 'G-ST-05', // Rebar Carapace
  I6: 'G-ST-06', // Shrapnel Talisman
  I7: 'G-ST-07', // Crystal Crown
  I8: 'G-ST-08', // Stone Sigil

  // SCOUT (8): I9-I16 -> G-SC-01 to G-SC-08
  I9: 'G-SC-01', // Miner Boots
  I10: 'G-SC-02', // Leather Gloves
  I11: 'G-SC-03', // Tunnel Instinct
  I12: 'G-SC-04', // Tunneler Spurs
  I13: 'G-SC-05', // Wall-Sense Visor
  I14: 'G-SC-06', // Drill Servo
  I15: 'G-SC-07', // Weak-Point Manual
  I16: 'G-SC-08', // Gear-Link Medallion

  // GREED (8): I17-I24 -> G-GR-01 to G-GR-08
  I17: 'G-GR-01', // Loose Nuggets
  I18: 'G-GR-02', // Lucky Coin
  I19: 'G-GR-03', // Gilded Band
  I20: 'G-GR-04', // Royal Bracer
  I21: 'G-GR-05', // Quartz Shard
  I22: 'G-GR-06', // Amber Shard
  I23: 'G-GR-07', // Zircon Shard
  I24: 'G-GR-08', // Tourmaline Shard

  // BLAST (8): I25-I32 -> G-BL-01 to G-BL-08
  I25: 'G-BL-01', // Small Charge
  I26: 'G-BL-02', // Blast Suit
  I27: 'G-BL-03', // Explosive Powder
  I28: 'G-BL-04', // Double Detonation
  I29: 'G-BL-05', // Bomb Satchel
  I30: 'G-BL-06', // Kindling Charge
  I31: 'G-BL-07', // Time Charge
  I32: 'G-BL-08', // Twin-Fuse Knot

  // FROST (8): I33-I40 -> G-FR-01 to G-FR-08
  I33: 'G-FR-01', // Frost Lantern
  I34: 'G-FR-02', // Frostguard Buckler
  I35: 'G-FR-03', // Cold Snap Charm
  I36: 'G-FR-04', // Ice Skates
  I37: 'G-FR-05', // Rime Cloak
  I38: 'G-FR-06', // Permafrost Core
  I39: 'G-FR-07', // Cold Front Idol
  I40: 'G-FR-08', // Deep Freeze Charm

  // RUST (8): I41-I48 -> G-RU-01 to G-RU-08
  I41: 'G-RU-01', // Oxidizer Vial
  I42: 'G-RU-02', // Rust Spike
  I43: 'G-RU-03', // Corroded Greaves
  I44: 'G-RU-04', // Acid Phial
  I45: 'G-RU-05', // Flaking Plating
  I46: 'G-RU-06', // Rust Engine
  I47: 'G-RU-07', // Corrosion Loop
  I48: 'G-RU-08', // Salvage Clamp

  // BLOOD (8): I49-I56 -> G-BO-01 to G-BO-08
  I49: 'G-BO-01', // Last Breath Sigil
  I50: 'G-BO-02', // Bloodletting Fang
  I51: 'G-BO-03', // Leech Wraps
  I52: 'G-BO-04', // Blood Chalice
  I53: 'G-BO-05', // Hemorrhage Hook
  I54: 'G-BO-06', // Execution Emblem
  I55: 'G-BO-07', // Gore Mantle
  I56: 'G-BO-08', // Vampiric Tooth

  // TEMPO (8): I57-I64 -> G-TE-01 to G-TE-08
  I57: 'G-TE-01', // Wind-Up Spring
  I58: 'G-TE-02', // Ambush Charm
  I59: 'G-TE-03', // Counterweight Buckle
  I60: 'G-TE-04', // Hourglass Charge
  I61: 'G-TE-05', // Initiative Lens
  I62: 'G-TE-06', // Backstep Buckle
  I63: 'G-TE-07', // Tempo Battery
  I64: 'G-TE-08', // Second Wind Clock
};

export const GEAR_BACKEND_TO_FRONTEND: Record<string, GearId> = Object.fromEntries(
  Object.entries(GEAR_FRONTEND_TO_BACKEND).map(([k, v]) => [v, k as GearId])
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert frontend tool ID to backend format
 */
export function toolToBackend(frontendId: ToolId): string {
  return TOOL_FRONTEND_TO_BACKEND[frontendId];
}

/**
 * Convert backend tool ID to frontend format
 */
export function toolToFrontend(backendId: string): ToolId | undefined {
  return TOOL_BACKEND_TO_FRONTEND[backendId];
}

/**
 * Convert frontend gear ID to backend format
 */
export function gearToBackend(frontendId: GearId): string {
  return GEAR_FRONTEND_TO_BACKEND[frontendId];
}

/**
 * Convert backend gear ID to frontend format
 */
export function gearToFrontend(backendId: string): GearId | undefined {
  return GEAR_BACKEND_TO_FRONTEND[backendId];
}

/**
 * Check if a string is a valid backend tool ID
 */
export function isValidBackendToolId(id: string): boolean {
  return id in TOOL_BACKEND_TO_FRONTEND;
}

/**
 * Check if a string is a valid backend gear ID
 */
export function isValidBackendGearId(id: string): boolean {
  return id in GEAR_BACKEND_TO_FRONTEND;
}

// ============================================================================
// Tag Mapping
// ============================================================================

export const TAG_TO_PREFIX: Record<string, string> = {
  STONE: 'ST',
  SCOUT: 'SC',
  GREED: 'GR',
  BLAST: 'BL',
  FROST: 'FR',
  RUST: 'RU',
  BLOOD: 'BO',
  TEMPO: 'TE',
};

export const PREFIX_TO_TAG: Record<string, string> = Object.fromEntries(
  Object.entries(TAG_TO_PREFIX).map(([k, v]) => [v, k])
);

/**
 * Extract tag from backend ID
 * e.g., 'G-ST-01' -> 'STONE', 'T-BL-02' -> 'BLAST'
 */
export function getTagFromBackendId(backendId: string): string | undefined {
  const parts = backendId.split('-');
  if (parts.length < 2) return undefined;
  const prefix = parts[1];
  if (prefix === 'XX') return undefined; // Basic Pickaxe has no tag
  return PREFIX_TO_TAG[prefix];
}
