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
