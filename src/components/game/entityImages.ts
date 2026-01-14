import type { EnemyId } from '../../game/map/types';
import type { BossId, POIId } from '../../game/engine/types';

// ============================================================================
// Asset Mappings (T105-T107)
// ============================================================================

export const ENEMY_IMAGES: Record<EnemyId, any> = {
  TUNNEL_RAT: require('../../../assets/field-enemies/tunnel-rat.png'),
  CAVE_BAT: require('../../../assets/field-enemies/cave-bat.png'),
  SPORE_SLIME: require('../../../assets/field-enemies/spore-slime.png'),
  RUST_MITE_SWARM: require('../../../assets/field-enemies/rust-mite-swarm.png'),
  COLLAPSED_MINER: require('../../../assets/field-enemies/collapsed-miner.png'),
  SHARD_BEETLE: require('../../../assets/field-enemies/shard-beetle.png'),
  TUNNEL_WARDEN: require('../../../assets/field-enemies/tunnel-warden.png'),
  BURROW_AMBUSHER: require('../../../assets/field-enemies/burrow-ambusher.png'),
  FROST_WISP: require('../../../assets/field-enemies/frost-wisp.png'),
  POWDER_TICK: require('../../../assets/field-enemies/powder-tick.png'),
  COIN_SLUG: require('../../../assets/field-enemies/coin-slug.png'),
  BLOOD_MOSQUITO: require('../../../assets/field-enemies/blood-mosquito.png'),
};

export const BOSS_IMAGES: Record<BossId, any> = {
  'B-A-W1-01': require('../../../assets/bosses/broodmother.png'),
  'B-A-W1-02': require('../../../assets/bosses/obisidian-golem.png'), // Typo in asset name
  'B-A-W1-03': require('../../../assets/bosses/gas-anomaly.png'),
  'B-A-W1-04': require('../../../assets/bosses/mad-miner.png'),
  'B-A-W1-05': require('../../../assets/bosses/shard-colossus.png'),
  'B-A-W2-01': require('../../../assets/bosses/drill-sergeant.png'),
  'B-A-W2-02': require('../../../assets/bosses/crystal-mimic.png'),
  'B-A-W2-03': require('../../../assets/bosses/rust-regent.png'),
  'B-A-W2-04': require('../../../assets/bosses/powder-keg-baron.png'),
  'B-A-W2-05': require('../../../assets/bosses/greedkeeper.png'),
  'B-A-W3-01': require('../../../assets/bosses/the-eldritch-mole.png'),
  'B-A-W3-02': require('../../../assets/bosses/the-gilded-devourer.png'),
  'B-B-W3-01': require('../../../assets/bosses/the-frostbound-leviathan .png'), // Space in asset name
  'B-B-W3-02': require('../../../assets/bosses/the-rusted-chronomancer.png'),
};

export const POI_IMAGES: Record<POIId, any> = {
  L1: require('../../../assets/POIs/mole-den.png'),
  L2: require('../../../assets/POIs/supply-cache.png'),
  L3: require('../../../assets/POIs/tool-crate.png'),
  L4: require('../../../assets/POIs/tool-oil-rack.png'),
  L5: require('../../../assets/POIs/rest-alcove.png'),
  L6: require('../../../assets/POIs/survey-beacon.png'),
  L7: require('../../../assets/POIs/seismic-scanner.png'),
  L8: require('../../../assets/POIs/rail-waypoint.png'),
  L9: require('../../../assets/POIs/smuggler-hatch.png'),
  L10: require('../../../assets/POIs/rusty-anvil.png'),
  L11: require('../../../assets/POIs/rune-kiln.png'),
  L12: require('../../../assets/POIs/geode-vault.png'),
  L13: require('../../../assets/POIs/counter-cache.png'),
  L14: require('../../../assets/POIs/scrap-chute.png'),
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
