# Data Model: Solana Program Instructions Integration

**Feature**: 008-solana-program-instructions
**Date**: 2026-01-27

## On-Chain Accounts (Read by Frontend)

All accounts are Program-Derived Addresses (PDAs) with deterministic seeds.

### PlayerProfile
**Program**: player-profile
**PDA Seeds**: `["player", owner_pubkey]`

| Field | Type | Description |
|-------|------|-------------|
| owner | PublicKey | Wallet address that owns this profile |
| name | String (max 32) | Player display name |
| total_runs | u32 | Lifetime run count |
| highest_level_unlocked | u8 | Highest campaign level available (1-40) |
| available_runs | u32 | Runs available to spend |
| created_at | i64 | Unix timestamp of creation |
| bump | u8 | PDA bump seed |
| unlocked_items | [u8; 10] | 80-bit bitmask of unlocked item indices |
| active_item_pool | [u8; 10] | 80-bit bitmask of items in active pool |

### GameSession
**Program**: session-manager
**PDA Seeds**: `["session", player_pubkey, &[campaign_level]]`

| Field | Type | Description |
|-------|------|-------------|
| player | PublicKey | Session owner |
| session_id | u64 | Global session counter value |
| campaign_level | u8 | Level being played (1-40) |
| started_at | i64 | Session start timestamp |
| last_activity | i64 | Last transaction timestamp |
| is_delegated | bool | Ephemeral rollup flag (stub) |
| bump | u8 | PDA bump seed |
| active_item_pool | [u8; 10] | Snapshot of profile's item pool at session start |
| burner_wallet | PublicKey | Burner wallet for gasless gameplay |
| state_hash | [u8; 32] | Last committed state hash |

### GameState
**Program**: gameplay-state
**PDA Seeds**: `["game_state", session_pda]`

| Field | Type | Description |
|-------|------|-------------|
| player | PublicKey | Session owner |
| session | PublicKey | GameSession PDA |
| position_x | u8 | Player X coordinate |
| position_y | u8 | Player Y coordinate |
| map_width | u8 | Map width |
| map_height | u8 | Map height |
| hp | i16 | Current hit points |
| gear_slots | u8 | Available gear slots (4/6/8) |
| week | u8 | Current week (1-3) |
| phase | Phase | Current day/night phase |
| moves_remaining | u8 | Moves left in current phase |
| total_moves | u32 | Cumulative moves this session |
| boss_fight_ready | bool | Boss fight pending flag |
| gold | u16 | Current gold |
| bump | u8 | PDA bump seed |
| campaign_level | u8 | Level being played |
| is_dead | bool | Player death flag |

**Phase enum**: Day1(0), Night1(1), Day2(2), Night2(3), Day3(4), Night3(5)

### GeneratedMap
**Program**: map-generator
**PDA Seeds**: `["generated_map", session_pda]`

| Field | Type | Description |
|-------|------|-------------|
| session | PublicKey | Associated session |
| width | u8 | Map width |
| height | u8 | Map height |
| seed | u64 | Generation seed |
| spawn_x | u8 | Player spawn X |
| spawn_y | u8 | Player spawn Y |
| mole_den_x | u8 | Mole den X (L1 POI) |
| mole_den_y | u8 | Mole den Y |
| walkable_count | u16 | Number of floor tiles |
| packed_tiles | [u8; 313] | Bit-packed 50x50 tile grid |
| enemy_count | u8 | Number of enemies spawned |
| enemies | [EnemySpawn; 48] | Enemy spawn positions |
| poi_count | u8 | Number of POIs spawned |
| pois | [PoiSpawn; 50] | POI spawn positions |
| bump | u8 | PDA bump seed |

### MapEnemies
**Program**: gameplay-state
**PDA Seeds**: `["map_enemies", session_pda]`

| Field | Type | Description |
|-------|------|-------------|
| session | PublicKey | Associated session |
| enemies | Vec\<EnemyInstance\> | Active enemy instances (max 48) |
| count | u8 | Enemy count |
| bump | u8 | PDA bump seed |

**EnemyInstance**: archetype_id(u8), tier(u8), x(u8), y(u8), defeated(bool)

### PlayerInventory
**Program**: player-inventory
**PDA Seeds**: `["inventory", session_pda]`

| Field | Type | Description |
|-------|------|-------------|
| session | PublicKey | Associated session |
| player | PublicKey | Player wallet |
| tool | Option\<ItemInstance\> | Equipped tool |
| gear | [Option\<ItemInstance\>; 8] | Gear slots |
| gear_slot_capacity | u8 | Available slots (4/6/8) |
| bump | u8 | PDA bump seed |

**ItemInstance**: item_id([u8; 8]), tier(Tier), tool_oil_flags(u8)

### MapPois
**Program**: poi-system
**PDA Seeds**: `["map_pois", session_pda]`

| Field | Type | Description |
|-------|------|-------------|
| session | PublicKey | Associated session |
| bump | u8 | PDA bump seed |
| count | u8 | POI count |
| act | u8 | Current act (1-4) |
| week | u8 | Current week (1-3) |
| seed | u64 | Generation seed |
| pois | Vec\<PoiInstance\> | POI instances (max 50) |
| shop_state | ShopState | Active shop data |
| current_offer | Option\<CacheOffer\> | Cached item offer |

**PoiInstance**: poi_type(u8), x(u8), y(u8), used(bool), discovered(bool), week_spawned(u8)

**ShopState**: poi_index(u8), offers([ItemOffer; 6]), reroll_count(u8), active(bool), rng_state(u64)

**ItemOffer**: item_id([u8; 8]), tier(u8), price(u16), purchased(bool)

## Transaction Events (Parsed by Frontend)

Events emitted by `move_player` instruction:

| Event | Source Program | Fields |
|-------|---------------|--------|
| PlayerMoved | gameplay-state | player, from_x, from_y, to_x, to_y |
| EnemyMoved | gameplay-state | enemy_index, from_x, from_y, to_x, to_y |
| CombatStarted | gameplay-state | player, player_hp, player_atk, enemy_archetype, enemy_hp, enemy_atk |
| CombatEnded | gameplay-state | player, player_won, final_player_hp, final_enemy_hp, gold_earned, turns_taken |
| CombatLog | gameplay-state | compressed turn-by-turn log entries |
| PhaseAdvanced | gameplay-state | player, old_phase, new_phase, moves_allowed |
| BossFightReady | gameplay-state | player, week |
| BossCombatStarted | gameplay-state | player, boss_id, boss_hp, week |
| LevelCompleted | gameplay-state | player, level, total_moves, gold_earned |
| PlayerDefeated | gameplay-state | player, killed_by, final_hp |

Events emitted by POI instructions:

| Event | Source Program | Fields |
|-------|---------------|--------|
| RestCompleted | poi-system | player, poi_index, hp_restored |
| ItemPicked | poi-system | player, poi_index, item_id, tier |
| ToolOilApplied | poi-system | player, poi_index, modification |
| ShopEntered | poi-system | player, poi_index, offer_count |
| ItemPurchased | poi-system | player, offer_index, item_id, price |
| ShopRerolled | poi-system | player, reroll_count, cost |
| ShopExited | poi-system | player |
| ToolUpgraded | poi-system | player, item_id, new_tier, cost |
| ItemsFused | poi-system | player, item_id, new_tier |
| WaypointDiscovered | poi-system | player, poi_index |
| FastTravelCompleted | poi-system | player, from_poi, to_poi |
| TilesRevealed | poi-system | player, poi_index, tile_count |
| PoiRevealed | poi-system | player, poi_index, category |
| GearScrapped | poi-system | player, item_id, gold_cost |
| PlayerHealed | gameplay-state | player, amount, new_hp |
| GoldModifiedAuthorized | gameplay-state | player, delta, new_gold |

## Relationships

```
PlayerProfile (1) ←── owns ──→ (N) GameSession
GameSession (1) ←── contains ──→ (1) GeneratedMap
GameSession (1) ←── contains ──→ (1) GameState
GameSession (1) ←── contains ──→ (1) MapEnemies
GameSession (1) ←── contains ──→ (1) PlayerInventory
GameSession (1) ←── contains ──→ (1) MapPois
```

All session-scoped accounts are created atomically by `start_session` and closed by `end_session`.
