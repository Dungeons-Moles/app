import type { EnemyId } from '../../game/map/types';
import type { BossId, POIId } from '../../game/engine/types';

// ============================================================================
// Asset Mappings (T105-T107)
// ============================================================================

export const ENEMY_IMAGES: Record<EnemyId, any> = {
  TUNNEL_RAT: require('../../../assets/entities/enemies/field/tunnel-rat.webp'),
  CAVE_BAT: require('../../../assets/entities/enemies/field/cave-bat.webp'),
  SPORE_SLIME: require('../../../assets/entities/enemies/field/spore-slime.webp'),
  RUST_MITE_SWARM: require('../../../assets/entities/enemies/field/rust-mite-swarm.webp'),
  COLLAPSED_MINER: require('../../../assets/entities/enemies/field/collapsed-miner.webp'),
  SHARD_BEETLE: require('../../../assets/entities/enemies/field/shard-beetle.webp'),
  TUNNEL_WARDEN: require('../../../assets/entities/enemies/field/tunnel-warden.webp'),
  BURROW_AMBUSHER: require('../../../assets/entities/enemies/field/burrow-ambusher.webp'),
  FROST_WISP: require('../../../assets/entities/enemies/field/frost-wisp.webp'),
  POWDER_TICK: require('../../../assets/entities/enemies/field/powder-tick.webp'),
  COIN_SLUG: require('../../../assets/entities/enemies/field/coin-slug.webp'),
  BLOOD_MOSQUITO: require('../../../assets/entities/enemies/field/blood-mosquito.webp'),
};

export const BOSS_IMAGES: Record<BossId, any> = {
  'B-A-W1-01': require('../../../assets/entities/enemies/bosses/broodmother.webp'),
  'B-A-W1-02': require('../../../assets/entities/enemies/bosses/obisidian-golem.webp'), // Typo in asset name
  'B-A-W1-03': require('../../../assets/entities/enemies/bosses/gas-anomaly.webp'),
  'B-A-W1-04': require('../../../assets/entities/enemies/bosses/mad-miner.webp'),
  'B-A-W1-05': require('../../../assets/entities/enemies/bosses/shard-colossus.webp'),
  'B-A-W2-01': require('../../../assets/entities/enemies/bosses/drill-sergeant.webp'),
  'B-A-W2-02': require('../../../assets/entities/enemies/bosses/crystal-mimic.webp'),
  'B-A-W2-03': require('../../../assets/entities/enemies/bosses/rust-regent.webp'),
  'B-A-W2-04': require('../../../assets/entities/enemies/bosses/powder-keg-baron.webp'),
  'B-A-W2-05': require('../../../assets/entities/enemies/bosses/greedkeeper.webp'),
  'B-A-W3-01': require('../../../assets/entities/enemies/bosses/the-eldritch-mole.webp'),
  'B-A-W3-02': require('../../../assets/entities/enemies/bosses/the-gilded-devourer.webp'),
  // Biome B Week 1-2 reuse Biome A boss art (same archetypes, +1 SPD)
  'B-B-W1-01': require('../../../assets/entities/enemies/bosses/broodmother.webp'),
  'B-B-W1-02': require('../../../assets/entities/enemies/bosses/obisidian-golem.webp'),
  'B-B-W1-03': require('../../../assets/entities/enemies/bosses/gas-anomaly.webp'),
  'B-B-W1-04': require('../../../assets/entities/enemies/bosses/mad-miner.webp'),
  'B-B-W1-05': require('../../../assets/entities/enemies/bosses/shard-colossus.webp'),
  'B-B-W2-01': require('../../../assets/entities/enemies/bosses/drill-sergeant.webp'),
  'B-B-W2-02': require('../../../assets/entities/enemies/bosses/crystal-mimic.webp'),
  'B-B-W2-03': require('../../../assets/entities/enemies/bosses/rust-regent.webp'),
  'B-B-W2-04': require('../../../assets/entities/enemies/bosses/powder-keg-baron.webp'),
  'B-B-W2-05': require('../../../assets/entities/enemies/bosses/greedkeeper.webp'),
  'B-B-W3-01': require('../../../assets/entities/enemies/bosses/the-frostbound-leviathan.webp'),
  'B-B-W3-02': require('../../../assets/entities/enemies/bosses/the-rusted-chronomancer.webp'),
};

export const POI_IMAGES: Record<POIId, any> = {
  L1: require('../../../assets/world/pois/mole-den.webp'),
  L2: require('../../../assets/world/pois/supply-cache.webp'),
  L3: require('../../../assets/world/pois/tool-crate.webp'),
  L4: require('../../../assets/world/pois/tool-oil-rack.webp'),
  L5: require('../../../assets/world/pois/rest-alcove.webp'),
  L6: require('../../../assets/world/pois/survey-beacon.webp'),
  L7: require('../../../assets/world/pois/seismic-scanner.webp'),
  L8: require('../../../assets/world/pois/rail-waypoint.webp'),
  L9: require('../../../assets/world/pois/smuggler-hatch.webp'),
  L10: require('../../../assets/world/pois/rusty-anvil.webp'),
  L11: require('../../../assets/world/pois/rune-kiln.webp'),
  L12: require('../../../assets/world/pois/geode-vault.webp'),
  L13: require('../../../assets/world/pois/counter-cache.webp'),
  L14: require('../../../assets/world/pois/scrap-chute.webp'),
};

export function getEnemyImage(id: EnemyId) {
  return ENEMY_IMAGES[id];
}

export function getBossImage(id: BossId) {
  return BOSS_IMAGES[id];
}

export function getPOIImage(id: POIId) {
  return POI_IMAGES[id];
}

export function getEntityImageSource(id: string) {
  return ENEMY_IMAGES[id as EnemyId] || BOSS_IMAGES[id as BossId] || POI_IMAGES[id as POIId];
}

/** Per-entity scale overrides for the combat arena (default 1.0). */
export const ENTITY_COMBAT_SCALE: Partial<Record<string, number>> = {
  TUNNEL_RAT: 0.7,
  CAVE_BAT: 0.7,
  SPORE_SLIME: 0.7,
  RUST_MITE_SWARM: 0.9,
  SHARD_BEETLE: 0.7,
  BURROW_AMBUSHER: 0.9,
  POWDER_TICK: 0.6,
  COIN_SLUG: 0.7,
  BLOOD_MOSQUITO: 0.7,
  'B-A-W1-02': 1.4,
  'B-A-W1-03': 1.2,
  'B-A-W1-04': 1.23,
  'B-A-W2-01': 1.4,
  'B-A-W2-03': 1.3,
  'B-A-W2-05': 1.2,
  'B-A-W3-01': 1.4,
  'B-A-W3-02': 1.4,
  'B-B-W1-02': 1.4,
  'B-B-W1-03': 1.2,
  'B-B-W1-04': 1.23,
  'B-B-W2-01': 1.4,
  'B-B-W2-03': 1.3,
  'B-B-W2-05': 1.2,
  'B-B-W3-01': 1.4,
  'B-B-W3-02': 1.1,
};

/** Per-entity vertical offset in the combat arena (positive = down, default 0). */
export const ENTITY_COMBAT_Y_OFFSET: Partial<Record<string, number>> = {
  TUNNEL_RAT: 38,
  CAVE_BAT: -25,
  SPORE_SLIME: 30,
  COLLAPSED_MINER: 30,
  SHARD_BEETLE: 30,
  BURROW_AMBUSHER: 20,
  POWDER_TICK: 30,
  COIN_SLUG: 25,
  BLOOD_MOSQUITO: 25,
  'B-A-W1-01': 20,
  'B-A-W1-02': 2,
  'B-A-W1-04': 15,
  'B-A-W1-05': 15,
  'B-A-W2-01': -8,
  'B-A-W2-02': 15,
  'B-A-W2-03': -8,
  'B-A-W2-04': 15,
  'B-A-W2-05': 15,
  'B-A-W3-01': -5,
  'B-A-W3-02': -5,
  'B-B-W1-01': 20,
  'B-B-W1-02': 2,
  'B-B-W1-04': 15,
  'B-B-W1-05': 15,
  'B-B-W2-01': -8,
  'B-B-W2-02': 15,
  'B-B-W2-03': -8,
  'B-B-W2-04': 15,
  'B-B-W2-05': 15,
  'B-B-W3-01': -5,
};

/** Per-entity horizontal offset in the combat arena (positive = right, default 0). */
export const ENTITY_COMBAT_X_OFFSET: Partial<Record<string, number>> = {
  COLLAPSED_MINER: 15,
  'B-A-W1-01': 15,
  'B-A-W1-02': 10,
  'B-A-W2-01': 15,
  'B-A-W2-02': 12,
  'B-A-W3-01': 6,
  'B-A-W3-02': 8,
  'B-B-W1-01': 15,
  'B-B-W1-02': 10,
  'B-B-W2-01': 15,
  'B-B-W2-02': 12,
  'B-B-W3-01': 8,
  'B-B-W3-02': 10,
};

export function getEntityCombatScale(id: string | undefined): number {
  if (!id) return 1;
  return ENTITY_COMBAT_SCALE[id] ?? 1;
}

export function getEntityCombatYOffset(id: string | undefined): number {
  if (!id) return 0;
  return ENTITY_COMBAT_Y_OFFSET[id] ?? 0;
}

export function getEntityCombatXOffset(id: string | undefined): number {
  if (!id) return 0;
  return ENTITY_COMBAT_X_OFFSET[id] ?? 0;
}
