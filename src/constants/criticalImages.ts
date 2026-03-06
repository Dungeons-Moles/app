export const GAME_SCREEN_BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.webp');
export const GAME_SCREEN_STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.webp');

export const GAME_SCREEN_CRITICAL_IMAGES = [
  GAME_SCREEN_BACKGROUND_IMAGE,
  GAME_SCREEN_STAINS_BACKGROUND,
] as const;

/** Game assets (tiles, enemies, POIs, UI) to preload during SessionLoadingScreen. */
export const GAME_PRELOAD_ASSETS = [
  require('../../assets/world/tiles/floor-v1.webp'),
  require('../../assets/world/tiles/floor-v2.webp'),
  require('../../assets/world/tiles/floor-v3.webp'),
  require('../../assets/world/tiles/floor-v4.webp'),
  require('../../assets/world/tiles/floor-v5.webp'),
  require('../../assets/world/tiles/rock-v1.webp'),
  require('../../assets/world/tiles/rock-v2.webp'),
  require('../../assets/world/tiles/rock-v3.webp'),
  require('../../assets/world/tiles/rock-v4.webp'),
  require('../../assets/world/markers/question-mark.webp'),
  require('../../assets/world/pois/mole-den.webp'),
  require('../../assets/world/pois/supply-cache.webp'),
  require('../../assets/world/pois/tool-crate.webp'),
  require('../../assets/world/pois/tool-oil-rack.webp'),
  require('../../assets/world/pois/rest-alcove.webp'),
  require('../../assets/world/pois/survey-beacon.webp'),
  require('../../assets/world/pois/seismic-scanner.webp'),
  require('../../assets/world/pois/rail-waypoint.webp'),
  require('../../assets/world/pois/smuggler-hatch.webp'),
  require('../../assets/world/pois/rusty-anvil.webp'),
  require('../../assets/world/pois/rune-kiln.webp'),
  require('../../assets/world/pois/geode-vault.webp'),
  require('../../assets/world/pois/counter-cache.webp'),
  require('../../assets/world/pois/scrap-chute.webp'),
  require('../../assets/entities/enemies/field/tunnel-rat.webp'),
  require('../../assets/entities/enemies/field/cave-bat.webp'),
  require('../../assets/entities/enemies/field/spore-slime.webp'),
  require('../../assets/entities/enemies/field/rust-mite-swarm.webp'),
  require('../../assets/entities/enemies/field/collapsed-miner.webp'),
  require('../../assets/entities/enemies/field/shard-beetle.webp'),
  require('../../assets/entities/enemies/field/tunnel-warden.webp'),
  require('../../assets/entities/enemies/field/burrow-ambusher.webp'),
  require('../../assets/entities/enemies/field/frost-wisp.webp'),
  require('../../assets/entities/enemies/field/powder-tick.webp'),
  require('../../assets/entities/enemies/field/coin-slug.webp'),
  require('../../assets/entities/enemies/field/blood-mosquito.webp'),
  require('../../assets/entities/characters/default-mole.webp'),
  require('../../assets/ui/panels/paper-panel.webp'),
  require('../../assets/ui/panels/sidebar.webp'),
] as const;

