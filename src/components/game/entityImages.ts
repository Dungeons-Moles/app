import type { EnemyId } from '../../game/map/types';
import type { BossId, POIId } from '../../game/engine/types';

// ============================================================================
// Asset Mappings (T105-T107)
// ============================================================================

export const ENEMY_IMAGES: Record<EnemyId, any> = {
  TUNNEL_RAT: require('../../../assets/entities/enemies/field/tunnel-rat.png'),
  CAVE_BAT: require('../../../assets/entities/enemies/field/cave-bat.png'),
  SPORE_SLIME: require('../../../assets/entities/enemies/field/spore-slime.png'),
  RUST_MITE_SWARM: require('../../../assets/entities/enemies/field/rust-mite-swarm.png'),
  COLLAPSED_MINER: require('../../../assets/entities/enemies/field/collapsed-miner.png'),
  SHARD_BEETLE: require('../../../assets/entities/enemies/field/shard-beetle.png'),
  TUNNEL_WARDEN: require('../../../assets/entities/enemies/field/tunnel-warden.png'),
  BURROW_AMBUSHER: require('../../../assets/entities/enemies/field/burrow-ambusher.png'),
  FROST_WISP: require('../../../assets/entities/enemies/field/frost-wisp.png'),
  POWDER_TICK: require('../../../assets/entities/enemies/field/powder-tick.png'),
  COIN_SLUG: require('../../../assets/entities/enemies/field/coin-slug.png'),
  BLOOD_MOSQUITO: require('../../../assets/entities/enemies/field/blood-mosquito.png'),
};

export const BOSS_IMAGES: Record<BossId, any> = {
  'B-A-W1-01': require('../../../assets/entities/enemies/bosses/broodmother.png'),
  'B-A-W1-02': require('../../../assets/entities/enemies/bosses/obisidian-golem.png'), // Typo in asset name
  'B-A-W1-03': require('../../../assets/entities/enemies/bosses/gas-anomaly.png'),
  'B-A-W1-04': require('../../../assets/entities/enemies/bosses/mad-miner.png'),
  'B-A-W1-05': require('../../../assets/entities/enemies/bosses/shard-colossus.png'),
  'B-A-W2-01': require('../../../assets/entities/enemies/bosses/drill-sergeant.png'),
  'B-A-W2-02': require('../../../assets/entities/enemies/bosses/crystal-mimic.png'),
  'B-A-W2-03': require('../../../assets/entities/enemies/bosses/rust-regent.png'),
  'B-A-W2-04': require('../../../assets/entities/enemies/bosses/powder-keg-baron.png'),
  'B-A-W2-05': require('../../../assets/entities/enemies/bosses/greedkeeper.png'),
  'B-A-W3-01': require('../../../assets/entities/enemies/bosses/the-eldritch-mole.png'),
  'B-A-W3-02': require('../../../assets/entities/enemies/bosses/the-gilded-devourer.png'),
  'B-B-W3-01': require('../../../assets/entities/enemies/bosses/the-frostbound-leviathan.png'),
  'B-B-W3-02': require('../../../assets/entities/enemies/bosses/the-rusted-chronomancer.png'),
};

export const POI_IMAGES: Record<POIId, any> = {
  L1: require('../../../assets/world/pois/mole-den.png'),
  L2: require('../../../assets/world/pois/supply-cache.png'),
  L3: require('../../../assets/world/pois/tool-crate.png'),
  L4: require('../../../assets/world/pois/tool-oil-rack.png'),
  L5: require('../../../assets/world/pois/rest-alcove.png'),
  L6: require('../../../assets/world/pois/survey-beacon.png'),
  L7: require('../../../assets/world/pois/seismic-scanner.png'),
  L8: require('../../../assets/world/pois/rail-waypoint.png'),
  L9: require('../../../assets/world/pois/smuggler-hatch.png'),
  L10: require('../../../assets/world/pois/rusty-anvil.png'),
  L11: require('../../../assets/world/pois/rune-kiln.png'),
  L12: require('../../../assets/world/pois/geode-vault.png'),
  L13: require('../../../assets/world/pois/counter-cache.png'),
  L14: require('../../../assets/world/pois/scrap-chute.png'),
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
