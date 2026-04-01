/**
 * Gear item definitions (64 items)
 * @see docs/gdd.md Section 9: Item System
 */

import type { GearId, ItemRarity, ItemTag, ItemStats, EffectTiming } from '../game/engine/types';
import { GEAR_EFFECTS } from './gear-effects';

export interface GearDefinition {
  id: GearId;
  name: string;
  emoji: string;
  image?: any;
  baseRarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
  effect?: {
    timing: EffectTiming;
    description: string;
  };
}

/**
 * All gear item definitions (64 items)
 * Organized by tag to match GDD structure
 */
export const GEAR_DEFINITIONS: Record<GearId, GearDefinition> = {
  // ============================================================================
  // STONE (8 items: I1-I8)
  // ============================================================================
  I1: {
    id: 'I1',
    name: 'Miner Helmet',
    emoji: '🪖',
    image: require('../../assets/icons/items/stone/miner_helmet.webp'),
    baseRarity: 'COMMON',
    stats: { arm: 3 },
    tags: ['STONE'],
    // Stats-only passive: no effect needed (stats are self-documenting)
  },
  I2: {
    id: 'I2',
    name: 'Work Vest',
    emoji: '🦺',
    image: require('../../assets/icons/items/stone/work_vest.webp'),
    baseRarity: 'COMMON',
    stats: { hp: 4, arm: 1 },
    tags: ['STONE'],
    // Stats-only passive: no effect needed (stats are self-documenting)
  },
  I3: {
    id: 'I3',
    name: 'Spiked Bracers',
    emoji: '🧱',
    image: require('../../assets/icons/items/stone/spiked_bracers.webp'),
    baseRarity: 'COMMON',
    stats: { arm: 1 },
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: +3/6/12 Shrapnel',
    },
  },
  I4: {
    id: 'I4',
    name: 'Reinforcement Plate',
    emoji: '🛡️',
    image: require('../../assets/icons/items/stone/reinforcement_plate.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn: gain 1/3/6 ARM and 1/2/4 Shrapnel',
    },
  },
  I5: {
    id: 'I5',
    name: 'Rebar Carapace',
    emoji: '🏗️',
    image: require('../../assets/icons/items/stone/rebar_carapace.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Exposed (once per battle): gain 4/8/16 ARM and 2/4/8 Shrapnel',
    },
  },
  I6: {
    id: 'I6',
    name: 'Shrapnel Talisman',
    emoji: '📿',
    image: require('../../assets/icons/items/stone/shrapnel_talisman.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'PASSIVE',
      description: 'Whenever you gain Shrapnel (once per battle): gain 2/4/8 ARM',
    },
  },
  I7: {
    id: 'I7',
    name: 'Crystal Crown',
    emoji: '👑',
    image: require('../../assets/icons/items/stone/crystal_crown.webp'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain Max HP equal to your starting ARM (cap 10/20/40)',
    },
  },
  I8: {
    id: 'I8',
    name: 'Stone Sigil',
    emoji: '🪨',
    image: require('../../assets/icons/items/stone/stone_sigil.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'TURN_END',
      description: 'End of turn: if you have 2+ ARM, gain 2/4/8 ARM',
    },
  },

  // ============================================================================
  // SCOUT (8 items: I9-I16)
  // ============================================================================
  I9: {
    id: 'I9',
    name: 'Miner Boots',
    emoji: '🥾',
    image: require('../../assets/icons/items/scout/miner_boots.webp'),
    baseRarity: 'COMMON',
    stats: { dig: 2 },
    tags: ['SCOUT'],
  },
  I10: {
    id: 'I10',
    name: 'Leather Gloves',
    emoji: '🧤',
    image: require('../../assets/icons/items/scout/leather_gloves.webp'),
    baseRarity: 'COMMON',
    stats: { atk: 1, dig: 1 },
    tags: ['SCOUT'],
  },
  I11: {
    id: 'I11',
    name: 'Tunnel Instinct',
    emoji: '🔍',
    image: require('../../assets/icons/items/scout/tunnel_instinct.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'If DIG > enemy DIG, gain +1/2/4 SPD and +1/2/4 ATK',
    },
  },
  I12: {
    id: 'I12',
    name: 'Tunneler Spurs',
    emoji: '🐎',
    image: require('../../assets/icons/items/scout/tunneler_spurs.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'If you act first on Turn 1, gain +1/2/4 DIG and +2/4/8 ARM',
    },
  },
  I13: {
    id: 'I13',
    name: 'Wall-Sense Visor',
    emoji: '👓',
    image: require('../../assets/icons/items/scout/wall-sense_visor.webp'),
    baseRarity: 'RARE',
    stats: { dig: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'If DIG > enemy DIG, gain +3/6/12 ARM',
    },
  },
  I14: {
    id: 'I14',
    name: 'Drill Servo',
    emoji: '⚙️',
    image: require('../../assets/icons/items/scout/drill_servo.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: gain +1/2/4 additional strikes and +2/4/8 ATK (this battle)',
    },
  },
  I15: {
    id: 'I15',
    name: 'Weak-Point Manual',
    emoji: '📖',
    image: require('../../assets/icons/items/scout/weak-point_manual.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'If DIG > enemy ARM: your strikes ignore 2/4/8 ARM',
    },
  },
  I16: {
    id: 'I16',
    name: 'Gear-Link Medallion',
    emoji: '🔗',
    image: require('../../assets/icons/items/scout/gear-link_medallion.webp'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'Your On Hit effects trigger twice (once/turn)',
    },
  },

  // ============================================================================
  // GREED (8 items: I17-I24)
  // ============================================================================
  I17: {
    id: 'I17',
    name: 'Loose Nuggets',
    emoji: '🪙',
    image: require('../../assets/icons/items/greed/loose_nuggets.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'PASSIVE',
      description: 'Start of each Day: gain 5/10/20 Gold',
    },
  },
  I18: {
    id: 'I18',
    name: 'Lucky Coin',
    emoji: '🍀',
    image: require('../../assets/icons/items/greed/lucky_coin.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'VICTORY',
      description: 'Victory: gain 2/4/8 Gold and heal 2/4/8 HP',
    },
  },
  I19: {
    id: 'I19',
    name: 'Ruby Shard',
    emoji: '💚',
    image: require('../../assets/icons/items/greed/ruby_shard.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): heal 2/4/8 HP',
    },
  },
  I20: {
    id: 'I20',
    name: 'Pyrite Shard',
    emoji: '💛',
    image: require('../../assets/icons/items/greed/pyrite_shard.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): gain 2/4/8 Gold',
    },
  },
  I21: {
    id: 'I21',
    name: 'Amethyst Shard',
    emoji: '💜',
    image: require('../../assets/icons/items/greed/amethyst_shard.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): deal 1/2/4 non-weapon damage',
    },
  },
  I22: {
    id: 'I22',
    name: 'Emerald Shard',
    emoji: '💚',
    image: require('../../assets/icons/items/greed/emerald_shard.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): gain 2/4/8 ARM',
    },
  },
  I23: {
    id: 'I23',
    name: 'Gilded Ring',
    emoji: '💍',
    image: require('../../assets/icons/items/greed/gilded_band.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'BATTLE_START',
      description:
        'Battle Start: gain ARM equal to Gold/6, rounded down, capped at 6/12/24; if Gold ≥ 20, gain +1/2/4 SPD',
    },
  },
  I24: {
    id: 'I24',
    name: 'Royal Bracer',
    emoji: '👑',
    image: require('../../assets/icons/items/greed/royal_bracer.webp'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'TURN_START',
      description:
        'Turn Start: convert 1 Gold → 4/8/16 ARM (max 3 times per battle); gold gains increased by 50/100/200%',
    },
  },

  // ============================================================================
  // BLAST (8 items: I25-I32)
  // ============================================================================
  I25: {
    id: 'I25',
    name: 'Small Charge',
    emoji: '🧨',
    image: require('../../assets/icons/items/blast/small_charge.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'COUNTDOWN',
      description: 'Countdown(3): deal 8/14/24 to enemy and 4/6/10 to you (non-weapon)',
    },
  },
  I26: {
    id: 'I26',
    name: 'Blast Suit',
    emoji: '🦾',
    image: require('../../assets/icons/items/blast/blast_suit.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description:
        'Your BLAST self-damage is reduced by 50% (round down); non-weapon damage grants +1/2/4 ARM once/turn',
    },
  },
  I27: {
    id: 'I27',
    name: 'Explosive Powder',
    emoji: '💥',
    image: require('../../assets/icons/items/blast/explosive_powder.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Your non-weapon damage deals +2/4/8',
    },
  },
  I28: {
    id: 'I28',
    name: 'Double Detonation',
    emoji: '💣',
    image: require('../../assets/icons/items/blast/double_detonation.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description:
        'First bomb detonation each turn deals +1/2/4 more to enemy and self; second deals +3/6/12 more to enemy and self',
    },
  },
  I29: {
    id: 'I29',
    name: 'Bomb Satchel',
    emoji: '🎒',
    image: require('../../assets/icons/items/blast/bomb_satchel.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'BATTLE_START',
      description:
        'Reduce Countdown of all your bomb items by 1 (min 1); your bombs deal +0/2/4 extra damage to enemies',
    },
  },
  I30: {
    id: 'I30',
    name: 'Kindling Charge',
    emoji: '🔥',
    image: require('../../assets/icons/items/blast/kindling_charge.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'BATTLE_START',
      description:
        'Battle Start: deal 2/4/8 non-weapon damage; your next bomb deals +3/6/12 and self-damage -2/4/8',
    },
  },
  I31: {
    id: 'I31',
    name: 'Time Charge',
    emoji: '⏳',
    image: require('../../assets/icons/items/blast/time_charge.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn Start: store +2/4/8 damage; when Exposed or Turn 5+: deal stored damage',
    },
  },
  I32: {
    id: 'I32',
    name: 'Twin-Fuse Knot',
    emoji: '🧬',
    image: require('../../assets/icons/items/blast/twin-fuse_knot.webp'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Your bomb triggers happen twice; next bomb self-damage reduced by 1/2/4',
    },
  },

  // ============================================================================
  // FROST (8 items: I33-I40)
  // ============================================================================
  I33: {
    id: 'I33',
    name: 'Frost Lantern',
    emoji: '🏮',
    image: require('../../assets/icons/items/frost/frost_lantern.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: apply 1/2/4 Chill',
    },
  },
  I34: {
    id: 'I34',
    name: 'Rime Cloak',
    emoji: '🧥❄️',
    image: require('../../assets/icons/items/frost/rime_cloak.webp'),
    baseRarity: 'RARE',
    stats: { arm: 3 },
    tags: ['FROST'],
    effect: {
      timing: 'ON_STRUCK',
      description: 'When struck (once/turn): apply 1/2/4 Chill to attacker',
    },
  },
  I35: {
    id: 'I35',
    name: 'Cold Snap Charm',
    emoji: '❄️✨',
    image: require('../../assets/icons/items/frost/cold_snap_charm.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'If you act first on Turn 1: apply 2/4/8 Chill and gain +2/4/8 ARM',
    },
  },
  I36: {
    id: 'I36',
    name: 'Ice Skates',
    emoji: '⛸️',
    image: require('../../assets/icons/items/frost/ice_skates.webp'),
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['FROST'],
  },
  I37: {
    id: 'I37',
    name: 'Frostguard Buckler',
    emoji: '🛡️❄️',
    image: require('../../assets/icons/items/frost/frostguard_buckler.webp'),
    baseRarity: 'HEROIC',
    stats: { arm: 6 },
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if enemy has Chill, gain +3/6/12 ARM and apply 1/2/4 Chill',
    },
  },
  I38: {
    id: 'I38',
    name: 'Permafrost Core',
    emoji: '🧊',
    image: require('../../assets/icons/items/frost/permafrost_core.webp'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'TURN_START',
      description:
        'Turn Start: if enemy has Chill, gain 2/4/8 ARM and deal 2/4/8 non-weapon damage',
    },
  },
  I39: {
    id: 'I39',
    name: 'Cold Front Idol',
    emoji: '🗿❄️',
    image: require('../../assets/icons/items/frost/cold_front_idol.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description:
        'Every other turn: apply 1/2/4 Chill, deal 2/4/8 non-weapon damage, and gain 1/2/4 ARM; if enemy already has Chill, gain +2/4/8 SPD this turn',
    },
  },
  I40: {
    id: 'I40',
    name: 'Deep Freeze Charm',
    emoji: '🌨️',
    image: require('../../assets/icons/items/frost/deep_freeze_charm.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'WOUNDED',
      description:
        'Wounded: apply 3/6/12 Chill, reduce enemy SPD by 1/2/4, and your non-weapon damage +1/2/4 while enemy is Chilled',
    },
  },
  // ============================================================================
  // RUST (8 items: I41-I48)
  // ============================================================================
  I41: {
    id: 'I41',
    name: 'Oxidizer Vial',
    emoji: '🧪',
    image: require('../../assets/icons/items/rust/oxidizer_vial.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: apply 1/2/4 Rust (if enemy has ARM, apply +1/2/4 more)',
    },
  },
  I42: {
    id: 'I42',
    name: 'Rust Spike',
    emoji: '🪛',
    image: require('../../assets/icons/items/rust/rust_spike.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description:
        'On Hit (once/turn): apply 1/2/4 Rust; if enemy has Rust ≥ 2, deal 2/4/8 non-weapon damage',
    },
  },
  I43: {
    id: 'I43',
    name: 'Corroded Greaves',
    emoji: '🥾☣️',
    image: require('../../assets/icons/items/rust/corroded_greaves.webp'),
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['RUST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: apply 1/2/4 Rust. Wounded: apply additional 2/4/8 Rust',
    },
  },
  I44: {
    id: 'I44',
    name: 'Acid Phial',
    emoji: '🧴',
    image: require('../../assets/icons/items/rust/acid_phial.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: reduce enemy ARM by 3/6/12 and apply 1/2/4 Rust',
    },
  },
  I45: {
    id: 'I45',
    name: 'Flaking Plating',
    emoji: '🛡️☣️',
    image: require('../../assets/icons/items/rust/flaking_plating.webp'),
    baseRarity: 'RARE',
    stats: { arm: 6 },
    tags: ['RUST'],
    effect: {
      timing: 'PASSIVE',
      description: 'When you lose 3+ Armor in a turn: apply 2/4/8 Rust to enemy',
    },
  },
  I46: {
    id: 'I46',
    name: 'Rust Engine',
    emoji: '⚙️☣️',
    image: require('../../assets/icons/items/rust/rust_engine.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn Start: if enemy has Rust or no ARM, deal 2/4/8 non-weapon damage',
    },
  },
  I47: {
    id: 'I47',
    name: 'Corrosion Loop',
    emoji: '🔄☣️',
    image: require('../../assets/icons/items/rust/corrosion_loop.webp'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description:
        'On Hit (once/turn): apply +2/4/8 additional Rust; if enemy has 0 ARM, deal 2/4/8 non-weapon damage',
    },
  },
  I48: {
    id: 'I48',
    name: 'Salvage Clamp',
    emoji: '🔧',
    image: require('../../assets/icons/items/rust/salvage_clamp.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'PASSIVE',
      description:
        'Whenever you apply Rust (once/turn): gain 2/4/8 Gold; Battle Start: apply 1/2/4 Rust',
    },
  },

  // ============================================================================
  // BLOOD (8 items: I49-I56)
  // ============================================================================
  I49: {
    id: 'I49',
    name: 'Last Breath Sigil',
    emoji: '💀',
    image: require('../../assets/icons/items/blood/last_breath_sigil.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_DEATH',
      description: 'One use: first time you would die in battle, prevent it and heal 3/6/12 HP',
    },
  },
  I50: {
    id: 'I50',
    name: 'Bloodletting Fang',
    emoji: '🦷🩸',
    image: require('../../assets/icons/items/blood/bloodletting_fang.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'PASSIVE',
      description: 'Your attacks deal +1/2/4 damage to Bleeding enemies',
    },
  },
  I51: {
    id: 'I51',
    name: 'Leech Wraps',
    emoji: '🩹',
    image: require('../../assets/icons/items/blood/leech_wraps.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'TURN_END',
      description: 'When enemy takes Bleed damage: gain +2/4/8 ARM and heal 2/4/8 HP (once/turn)',
    },
  },
  I52: {
    id: 'I52',
    name: 'Blood Chalice',
    emoji: '🏆🩸',
    image: require('../../assets/icons/items/blood/blood_chalice.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'VICTORY',
      description: 'Victory: heal 4/8/16 HP',
    },
  },
  I53: {
    id: 'I53',
    name: 'Hemorrhage Hook',
    emoji: '🪝🩸',
    image: require('../../assets/icons/items/blood/hemorrhage_hook.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: apply 3/6/12 Bleed',
    },
  },
  I54: {
    id: 'I54',
    name: 'Execution Emblem',
    emoji: '⚔️🩸',
    image: require('../../assets/icons/items/blood/execution_emblem.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_HIT',
      description: 'If enemy is Wounded, your first strike each turn deals +3/6/12 damage',
    },
  },
  I55: {
    id: 'I55',
    name: 'Gore Mantle',
    emoji: '🧥🩸',
    image: require('../../assets/icons/items/blood/gore_mantle.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'WOUNDED',
      description: 'First time you become Wounded in battle: gain 4/8/16 ARM',
    },
  },
  I56: {
    id: 'I56',
    name: 'Vampiric Tooth',
    emoji: '🧛',
    image: require('../../assets/icons/items/blood/vampiric_tooth.webp'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_HIT',
      description:
        'On Hit (once/turn): apply 1/2/4 Bleed; your first hit each turn vs a Bleeding enemy heals HP equal to Bleed (max 5/10/20)',
    },
  },

  // ============================================================================
  // TEMPO (8 items: I57-I64)
  // ============================================================================
  I57: {
    id: 'I57',
    name: 'Wind-Up Spring',
    emoji: '🌀',
    image: require('../../assets/icons/items/tempo/wind-up_spring.webp'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['TEMPO'],
    // Baked Battle Start stats are shown in the Stats section
  },
  I58: {
    id: 'I58',
    name: 'Ambush Charm',
    emoji: '🎯',
    image: require('../../assets/icons/items/tempo/ambush_charm.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If you act first on Turn 1, your first strike deals +4/8/16 damage and gain +1/2/4 ATK',
    },
  },
  I59: {
    id: 'I59',
    name: 'Counterweight Buckle',
    emoji: '⚖️',
    image: require('../../assets/icons/items/tempo/counterweight_buckle.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'BATTLE_START',
      description:
        'If enemy acts first on Turn 1, gain +7/14/28 ARM and 2/4/8 Shrapnel before damage',
    },
  },
  I60: {
    id: 'I60',
    name: 'Hourglass Charge',
    emoji: '⏳',
    image: require('../../assets/icons/items/tempo/hourglass_charge.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn 3: gain +2/4/8 ATK and +1/2/4 SPD',
    },
  },
  I61: {
    id: 'I61',
    name: 'Initiative Lens',
    emoji: '🔭',
    image: require('../../assets/icons/items/tempo/initiative_lens.webp'),
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['TEMPO'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if your SPD > enemy SPD, gain 3/6/12 ARM',
    },
  },
  I62: {
    id: 'I62',
    name: 'Backstep Buckle',
    emoji: '🔙',
    image: require('../../assets/icons/items/tempo/backstep_buckle.webp'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description:
        'If enemy acts first on Turn 1, gain 4/8/16 ARM and your first strike deals +3/6/12 damage',
    },
  },
  I63: {
    id: 'I63',
    name: 'Tempo Battery',
    emoji: '🔋',
    image: require('../../assets/icons/items/tempo/tempo_battery.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn: gain +2/4/8 SPD',
    },
  },
  I64: {
    id: 'I64',
    name: 'Second Wind Clock',
    emoji: '🕐',
    image: require('../../assets/icons/items/tempo/second_wind_clock.webp'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn 5: heal 6/12/24 HP and gain +2/4/8 SPD',
    },
  },
};

/**
 * Get gear definition by ID
 */
export function getGearDefinition(id: GearId): GearDefinition {
  return GEAR_DEFINITIONS[id];
}

/**
 * Get all gear definitions as an array
 */
export function getAllGearDefinitions(): GearDefinition[] {
  return Object.values(GEAR_DEFINITIONS);
}

/**
 * Get gear definitions by tag
 */
export function getGearByTag(tag: ItemTag): GearDefinition[] {
  return getAllGearDefinitions().filter((gear) => gear.tags.includes(tag));
}

/**
 * Get gear definitions by rarity
 */
export function getGearByRarity(rarity: ItemRarity): GearDefinition[] {
  return getAllGearDefinitions().filter((gear) => gear.baseRarity === rarity);
}

/**
 * Rarity stat multipliers for gear upgrades
 */
export const RARITY_MULTIPLIER: Record<ItemRarity, number> = {
  COMMON: 1.0,
  SAPPHIRE: 2.0,
  GOLDEN: 4.0,
  RARE: 1.0,
  HEROIC: 1.0,
  MYTHIC: 1.0,
};

/**
 * Item tier for tier-scaled effects (I, II, III)
 */
export type ItemTier = 1 | 2 | 3;

/**
 * Derive tier from rarity: COMMON→T1, SAPPHIRE→T2, GOLDEN→T3
 */
export function getTierFromRarity(rarity: ItemRarity): ItemTier {
  switch (rarity) {
    case 'SAPPHIRE':
      return 2;
    case 'GOLDEN':
      return 3;
    default:
      return 1;
  }
}

/**
 * Replace the first occurrence of a numeric value in a description.
 * Prefers +V patterns (stat bonuses like "+2 ATK") over bare matches,
 * and skips numbers already inside X/Y/Z slash notation.
 */
function replaceValue(text: string, oldVal: number, newStr: string): string {
  // Prefer +V (stat bonus) — avoids contextual numbers like "Turn 1", "Countdown(2)"
  const plusPattern = new RegExp(`\\+${oldVal}\\b(?!\\/\\d)`);
  if (plusPattern.test(text)) {
    return text.replace(plusPattern, `+${newStr}`);
  }
  // Fallback: bare word-bounded match, skip if inside existing slash notation
  return text.replace(new RegExp(`(?<!\\d\\/)\\b${oldVal}\\b(?!\\/\\d)`), newStr);
}

/**
 * Resolve a description to show only the given tier's values.
 * 1. Replaces existing X/Y/Z slash notation with the tier-appropriate value
 * 2. Replaces remaining base values with tier values for effects without slash notation
 *    Uses placeholders to prevent cascading replacements (e.g., +1→+2 then +2→+3)
 */
export function resolveDescriptionForTier(
  description: string,
  effects: { values: [number, number, number] }[],
  tier: number
): string {
  const handledBaseValues = new Set<number>();
  let result = description.replace(/(\d+)\/(\d+)\/(\d+)/g, (_match, v1, v2, v3) => {
    handledBaseValues.add(Number(v1));
    return [v1, v2, v3][tier - 1];
  });

  if (tier > 1) {
    // Collect replacements, use placeholders to avoid cascading
    const replacements: { oldVal: number; newVal: string; placeholder: string }[] = [];
    let idx = 0;
    for (const effect of effects) {
      const baseValue = effect.values[0];
      const scaledValue = effect.values[tier - 1];
      if (baseValue !== scaledValue && !handledBaseValues.has(baseValue)) {
        replacements.push({
          oldVal: baseValue,
          newVal: String(scaledValue),
          placeholder: `\x00${idx++}\x00`,
        });
      }
    }
    // Pass 1: replace values with placeholders
    for (const r of replacements) {
      result = replaceValue(result, r.oldVal, r.placeholder);
    }
    // Pass 2: replace placeholders with final values
    for (const r of replacements) {
      result = result.replace(r.placeholder, r.newVal);
    }
  }

  return result;
}

/**
 * Generate a description with X/Y/Z notation for all scaling values.
 * Values that are the same across all tiers are left as-is.
 * Values already in slash notation are left as-is.
 */
export function resolveDescriptionAllTiers(
  description: string,
  effects: { values: [number, number, number] }[]
): string {
  let result = description;

  for (const effect of effects) {
    const [v1, v2, v3] = effect.values;
    if (v1 === v2 && v2 === v3) continue;

    const slashNotation = `${v1}/${v2}/${v3}`;
    if (result.includes(slashNotation)) continue;

    result = replaceValue(result, v1, slashNotation);
  }

  return result;
}

/**
 * Get the effect description scaled to the item's current tier.
 * Handles both items with slash notation (e.g., "3/4/5") and items without.
 */
export function getScaledEffectDescription(gearId: GearId, rarity: ItemRarity): string | null {
  const def = GEAR_DEFINITIONS[gearId];
  if (!def.effect) return null;

  const tier = getTierFromRarity(rarity);
  const gearEffects = GEAR_EFFECTS[gearId];

  return resolveDescriptionForTier(def.effect.description, gearEffects?.effects ?? [], tier);
}

/**
 * Get the effect description showing all tier values in X/Y/Z notation.
 */
export function getEffectDescriptionAllTiers(gearId: GearId): string | null {
  const def = GEAR_DEFINITIONS[gearId];
  if (!def.effect) return null;

  const gearEffects = GEAR_EFFECTS[gearId];
  if (!gearEffects || gearEffects.effects.length === 0) return def.effect.description;

  return resolveDescriptionAllTiers(def.effect.description, gearEffects.effects);
}

/**
 * Get scaled stat value based on item tier
 * Uses the pattern: base * tier for simple scaling
 * For items with tier arrays like [1, 2, 3], returns tierArray[tier - 1]
 */
export function getItemStats(
  gearId: GearId,
  tier: ItemTier = 1
): { stats: ItemStats; effectValue?: number } {
  const def = getGearDefinition(gearId);
  const multiplier = tier;

  // Scale base stats by tier
  const scaledStats: ItemStats = {};
  if (def.stats.atk !== undefined) scaledStats.atk = def.stats.atk * multiplier;
  if (def.stats.arm !== undefined) scaledStats.arm = def.stats.arm * multiplier;
  if (def.stats.spd !== undefined) scaledStats.spd = def.stats.spd * multiplier;
  if (def.stats.dig !== undefined) scaledStats.dig = def.stats.dig * multiplier;
  if (def.stats.hp !== undefined) scaledStats.hp = def.stats.hp * multiplier;

  // Effect value scales with tier (base value at tier 1)
  // Most effects use pattern: tier 1 = base, tier 2 = base+1 or base*1.5, tier 3 = base+2 or base*2
  const effectValue = tier;

  return {
    stats: scaledStats,
    effectValue,
  };
}

/**
 * Create a gear instance from a definition with optional rarity upgrade
 */
export function createGearInstance(
  id: GearId,
  currentRarity?: ItemRarity
): {
  id: GearId;
  name: string;
  emoji: string;
  image?: any;
  baseRarity: ItemRarity;
  currentRarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
} {
  const def = getGearDefinition(id);
  const rarity = currentRarity ?? def.baseRarity;
  const multiplier = RARITY_MULTIPLIER[rarity];

  // Scale numeric stats by rarity multiplier
  const scaledStats: ItemStats = {};
  if (def.stats.atk !== undefined) scaledStats.atk = Math.floor(def.stats.atk * multiplier);
  if (def.stats.arm !== undefined) scaledStats.arm = Math.floor(def.stats.arm * multiplier);
  if (def.stats.spd !== undefined) scaledStats.spd = Math.floor(def.stats.spd * multiplier);
  if (def.stats.dig !== undefined) scaledStats.dig = Math.floor(def.stats.dig * multiplier);
  if (def.stats.hp !== undefined) scaledStats.hp = Math.floor(def.stats.hp * multiplier);

  return {
    id: def.id,
    name: def.name,
    emoji: def.emoji,
    image: def.image,
    baseRarity: def.baseRarity,
    currentRarity: rarity,
    stats: scaledStats,
    tags: [...def.tags],
  };
}
