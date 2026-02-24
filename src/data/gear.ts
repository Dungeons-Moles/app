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
    image: require('../../assets/icons/items/stone/miner_helmet.png'),
    baseRarity: 'COMMON',
    stats: { arm: 3 },
    tags: ['STONE'],
    // Stats-only passive: no effect needed (stats are self-documenting)
  },
  I2: {
    id: 'I2',
    name: 'Work Vest',
    emoji: '🦺',
    image: require('../../assets/icons/items/stone/work_vest.png'),
    baseRarity: 'COMMON',
    stats: { hp: 4, arm: 1 },
    tags: ['STONE'],
    // Stats-only passive: no effect needed (stats are self-documenting)
  },
  I3: {
    id: 'I3',
    name: 'Spiked Bracers',
    emoji: '🧱',
    image: require('../../assets/icons/items/stone/spiked_bracers.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain 2 Shrapnel',
    },
  },
  I4: {
    id: 'I4',
    name: 'Reinforcement Plate',
    emoji: '🛡️',
    image: require('../../assets/icons/items/stone/reinforcement_plate.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn: gain 1 Armor',
    },
  },
  I5: {
    id: 'I5',
    name: 'Rebar Carapace',
    emoji: '🏗️',
    image: require('../../assets/icons/items/stone/rebar_carapace.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'EXPOSED',
      description: 'First time you become Exposed in battle: gain 4 Armor',
    },
  },
  I6: {
    id: 'I6',
    name: 'Shrapnel Talisman',
    emoji: '📿',
    image: require('../../assets/icons/items/stone/shrapnel_talisman.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'PASSIVE',
      description: 'First time you gain Shrapnel in battle: gain 2 Armor',
    },
  },
  I7: {
    id: 'I7',
    name: 'Crystal Crown',
    emoji: '👑',
    image: require('../../assets/icons/items/stone/crystal_crown.png'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain Max HP equal to your starting Armor (cap 10)',
    },
  },
  I8: {
    id: 'I8',
    name: 'Stone Sigil',
    emoji: '🪨',
    image: require('../../assets/icons/items/stone/stone_sigil.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'TURN_END',
      description: 'End of turn: if you have 3+ Armor, gain 1 Armor',
    },
  },

  // ============================================================================
  // SCOUT (8 items: I9-I16)
  // ============================================================================
  I9: {
    id: 'I9',
    name: 'Miner Boots',
    emoji: '🥾',
    image: require('../../assets/icons/items/scout/miner_boots.png'),
    baseRarity: 'COMMON',
    stats: { dig: 2 },
    tags: ['SCOUT'],
  },
  I10: {
    id: 'I10',
    name: 'Leather Gloves',
    emoji: '🧤',
    image: require('../../assets/icons/items/scout/leather_gloves.png'),
    baseRarity: 'COMMON',
    stats: { atk: 1, dig: 1 },
    tags: ['SCOUT'],
  },
  I11: {
    id: 'I11',
    name: 'Tunnel Instinct',
    emoji: '🔍',
    image: require('../../assets/icons/items/scout/tunnel_instinct.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if DIG > enemy DIG, gain +1 SPD (this battle)',
    },
  },
  I12: {
    id: 'I12',
    name: 'Tunneler Spurs',
    emoji: '🐎',
    image: require('../../assets/icons/items/scout/tunneler_spurs.png'),
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If you act first on Turn 1, gain +1 DIG (this battle)',
    },
  },
  I13: {
    id: 'I13',
    name: 'Wall-Sense Visor',
    emoji: '👓',
    image: require('../../assets/icons/items/scout/wall-sense_visor.png'),
    baseRarity: 'RARE',
    stats: { dig: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if DIG > enemy DIG, gain +2 Armor',
    },
  },
  I14: {
    id: 'I14',
    name: 'Drill Servo',
    emoji: '⚙️',
    image: require('../../assets/icons/items/scout/drill_servo.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: gain +1 additional strikes (this battle)',
    },
  },
  I15: {
    id: 'I15',
    name: 'Weak-Point Manual',
    emoji: '📖',
    image: require('../../assets/icons/items/scout/weak-point_manual.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'PASSIVE',
      description: 'If DIG > enemy Armor: your strikes ignore 1 Armor (this battle)',
    },
  },
  I16: {
    id: 'I16',
    name: 'Gear-Link Medallion',
    emoji: '🔗',
    image: require('../../assets/icons/items/scout/gear-link_medallion.png'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'Your On Hit effects from SCOUT items trigger twice (once/turn); Tier II/III: +1/2 SPD',
    },
  },

  // ============================================================================
  // GREED (8 items: I17-I24)
  // ============================================================================
  I17: {
    id: 'I17',
    name: 'Loose Nuggets',
    emoji: '🪙',
    image: require('../../assets/icons/items/greed/loose_nuggets.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'DAY_START',
      description: 'Start of each Day: gain 3 Gold',
    },
  },
  I18: {
    id: 'I18',
    name: 'Lucky Coin',
    emoji: '🍀',
    image: require('../../assets/icons/items/greed/lucky_coin.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'VICTORY',
      description: 'Victory: gain 2 Gold and heal 2 HP',
    },
  },
  I19: {
    id: 'I19',
    name: 'Gilded Band',
    emoji: '💍',
    image: require('../../assets/icons/items/greed/gilded_band.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain Armor equal to floor(Gold/8) (cap 4)',
    },
  },
  I20: {
    id: 'I20',
    name: 'Royal Bracer',
    emoji: '👑',
    image: require('../../assets/icons/items/greed/royal_bracer.png'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn Start: convert 1 Gold -> 3 Armor; gold gains increased by 50% (round down)',
    },
  },
  I21: {
    id: 'I21',
    name: 'Emerald Shard',
    emoji: '💚',
    image: require('../../assets/icons/items/greed/emerald_shard.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): heal 1 HP',
    },
  },
  I22: {
    id: 'I22',
    name: 'Ruby Shard',
    emoji: '❤️',
    image: require('../../assets/icons/items/greed/ruby_shard.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): deal 1 non-weapon damage',
    },
  },
  I23: {
    id: 'I23',
    name: 'Sapphire Shard',
    emoji: '💙',
    image: require('../../assets/icons/items/greed/sapphire_shard.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): gain 1 Armor',
    },
  },
  I24: {
    id: 'I24',
    name: 'Citrine Shard',
    emoji: '💛',
    image: require('../../assets/icons/items/greed/citrine_shard.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): gain 1 Gold',
    },
  },

  // ============================================================================
  // BLAST (8 items: I25-I32)
  // ============================================================================
  I25: {
    id: 'I25',
    name: 'Small Charge',
    emoji: '🧨',
    image: require('../../assets/icons/items/blast/small_charge.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'COUNTDOWN',
      description: 'Countdown(2): deal 10 to enemy and 4 to you (non-weapon)',
    },
  },
  I26: {
    id: 'I26',
    name: 'Blast Suit',
    emoji: '🦾',
    image: require('../../assets/icons/items/blast/blast_suit.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'You ignore damage from your own BLAST items; Battle Start: gain 2 Armor',
    },
  },
  I27: {
    id: 'I27',
    name: 'Explosive Powder',
    emoji: '💥',
    image: require('../../assets/icons/items/blast/explosive_powder.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Your non-weapon damage deals +1',
    },
  },
  I28: {
    id: 'I28',
    name: 'Double Detonation',
    emoji: '💣',
    image: require('../../assets/icons/items/blast/double_detonation.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Second time you deal non-weapon damage each turn: deal +2 more',
    },
  },
  I29: {
    id: 'I29',
    name: 'Bomb Satchel',
    emoji: '🎒',
    image: require('../../assets/icons/items/blast/bomb_satchel.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: reduce Countdown of all your bomb items by 1 (min 0); Tier II/III: +1/2 ARM',
    },
  },
  I30: {
    id: 'I30',
    name: 'Kindling Charge',
    emoji: '🔥',
    image: require('../../assets/icons/items/blast/kindling_charge.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: deal 2 non-weapon damage; your next bomb this battle deals +3',
    },
  },
  I31: {
    id: 'I31',
    name: 'Time Charge',
    emoji: '⏳',
    image: require('../../assets/icons/items/blast/time_charge.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'TURN_START',
      description:
        'Turn Start: gain +1 stored damage (this battle); when Exposed or at battle end: deal stored damage',
    },
  },
  I32: {
    id: 'I32',
    name: 'Twin-Fuse Knot',
    emoji: '🧬',
    image: require('../../assets/icons/items/blast/twin-fuse_knot.png'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Your bomb triggers happen twice; Tier II/III: next bomb self-damage reduced by 1/2',
    },
  },

  // ============================================================================
  // FROST (8 items: I33-I40)
  // ============================================================================
  I33: {
    id: 'I33',
    name: 'Frost Lantern',
    emoji: '🏮',
    image: require('../../assets/icons/items/frost/frost_lantern.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: give enemy 1 Chill',
    },
  },
  I34: {
    id: 'I34',
    name: 'Frostguard Buckler',
    emoji: '🛡️❄️',
    image: require('../../assets/icons/items/frost/frostguard_buckler.png'),
    baseRarity: 'HEROIC',
    stats: { arm: 8 },
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if enemy has Chill, gain +3 Armor and apply 1 Chill',
    },
  },
  I35: {
    id: 'I35',
    name: 'Cold Snap Charm',
    emoji: '❄️✨',
    image: require('../../assets/icons/items/frost/cold_snap_charm.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If you act first on Turn 1: apply 2 Chill',
    },
  },
  I36: {
    id: 'I36',
    name: 'Ice Skates',
    emoji: '⛸️',
    image: require('../../assets/icons/items/frost/ice_skates.png'),
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain +1 DIG',
    },
  },
  I37: {
    id: 'I37',
    name: 'Rime Cloak',
    emoji: '🧥❄️',
    image: require('../../assets/icons/items/frost/rime_cloak.png'),
    baseRarity: 'RARE',
    stats: { arm: 3 },
    tags: ['FROST'],
    effect: {
      timing: 'ON_STRUCK',
      description: 'When struck (once/turn): apply 1 Chill to attacker',
    },
  },
  I38: {
    id: 'I38',
    name: 'Permafrost Core',
    emoji: '🧊',
    image: require('../../assets/icons/items/frost/permafrost_core.png'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn Start: if enemy has Chill, gain 2 Armor and deal 2 non-weapon damage',
    },
  },
  I39: {
    id: 'I39',
    name: 'Cold Front Idol',
    emoji: '🗿❄️',
    image: require('../../assets/icons/items/frost/cold_front_idol.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description:
        'Every other turn: apply 1 Chill and deal 1/2/3 non-weapon damage; if enemy already has Chill, gain +1/1/2 SPD this turn',
    },
  },
  I40: {
    id: 'I40',
    name: 'Deep Freeze Charm',
    emoji: '🌨️',
    image: require('../../assets/icons/items/frost/deep_freeze_charm.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: apply 2 Chill, reduce enemy SPD by 1 (this battle), and amplify non-weapon damage by 1',
    },
  },
  // ============================================================================
  // RUST (8 items: I41-I48)
  // ============================================================================
  I41: {
    id: 'I41',
    name: 'Oxidizer Vial',
    emoji: '🧪',
    image: require('../../assets/icons/items/rust/oxidizer_vial.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: apply 1 Rust (if enemy has Armor, apply +1 more)',
    },
  },
  I42: {
    id: 'I42',
    name: 'Rust Spike',
    emoji: '🪛',
    image: require('../../assets/icons/items/rust/rust_spike.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): apply 1 Rust; if enemy has Rust >= 3, deal 1 non-weapon damage',
    },
  },
  I43: {
    id: 'I43',
    name: 'Corroded Greaves',
    emoji: '🥾☣️',
    image: require('../../assets/icons/items/rust/corroded_greaves.png'),
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['RUST'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: apply 2 Rust',
    },
  },
  I44: {
    id: 'I44',
    name: 'Acid Phial',
    emoji: '🧴',
    image: require('../../assets/icons/items/rust/acid_phial.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: reduce enemy Armor by 2',
    },
  },
  I45: {
    id: 'I45',
    name: 'Flaking Plating',
    emoji: '🛡️☣️',
    image: require('../../assets/icons/items/rust/flaking_plating.png'),
    baseRarity: 'RARE',
    stats: { arm: 6 },
    tags: ['RUST'],
    effect: {
      timing: 'EXPOSED',
      description: 'Exposed: apply 2 Rust to enemy',
    },
  },
  I46: {
    id: 'I46',
    name: 'Rust Engine',
    emoji: '⚙️☣️',
    image: require('../../assets/icons/items/rust/rust_engine.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn Start: if enemy has Rust or no Armor, deal 1 non-weapon damage',
    },
  },
  I47: {
    id: 'I47',
    name: 'Corrosion Loop',
    emoji: '🔄☣️',
    image: require('../../assets/icons/items/rust/corrosion_loop.png'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): apply +2/3/4 additional Rust; if enemy has 0 Armor, deal 2/3/4 non-weapon damage',
    },
  },
  I48: {
    id: 'I48',
    name: 'Salvage Clamp',
    emoji: '🔧',
    image: require('../../assets/icons/items/rust/salvage_clamp.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'PASSIVE',
      description:
        'Whenever you apply Rust (once/turn): gain 1/2/3 Gold; if enemy has no Armor, apply 1 Rust at battle start',
    },
  },

  // ============================================================================
  // BLOOD (8 items: I49-I56)
  // ============================================================================
  I49: {
    id: 'I49',
    name: 'Last Breath Sigil',
    emoji: '💀',
    image: require('../../assets/icons/items/blood/last_breath_sigil.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_DEATH',
      description: 'One use: first time you would die in battle, prevent it and heal 2 HP',
    },
  },
  I50: {
    id: 'I50',
    name: 'Bloodletting Fang',
    emoji: '🦷🩸',
    image: require('../../assets/icons/items/blood/bloodletting_fang.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'PASSIVE',
      description: 'Your attacks deal +1 damage to Bleeding enemies',
    },
  },
  I51: {
    id: 'I51',
    name: 'Leech Wraps',
    emoji: '🩹',
    image: require('../../assets/icons/items/blood/leech_wraps.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'TURN_END',
      description: 'When enemy takes Bleed damage: heal 1 HP (once/turn)',
    },
  },
  I52: {
    id: 'I52',
    name: 'Blood Chalice',
    emoji: '🏆🩸',
    image: require('../../assets/icons/items/blood/blood_chalice.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'VICTORY',
      description: 'Victory: heal 3 HP',
    },
  },
  I53: {
    id: 'I53',
    name: 'Hemorrhage Hook',
    emoji: '🪝🩸',
    image: require('../../assets/icons/items/blood/hemorrhage_hook.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: apply 2 Bleed',
    },
  },
  I54: {
    id: 'I54',
    name: 'Execution Emblem',
    emoji: '⚔️🩸',
    image: require('../../assets/icons/items/blood/execution_emblem.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_HIT',
      description: 'If enemy is Wounded, your first strike each turn deals +2 damage',
    },
  },
  I55: {
    id: 'I55',
    name: 'Gore Mantle',
    emoji: '🧥🩸',
    image: require('../../assets/icons/items/blood/gore_mantle.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'WOUNDED',
      description: 'First time you become Wounded in battle: gain 4 Armor',
    },
  },
  I56: {
    id: 'I56',
    name: 'Vampiric Tooth',
    emoji: '🧛',
    image: require('../../assets/icons/items/blood/vampiric_tooth.png'),
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_HIT',
      description:
        'On Hit (once/turn): apply 1 Bleed; your first hit each turn vs a Bleeding enemy heals HP equal to Bleed (max 5/7/9)',
    },
  },

  // ============================================================================
  // TEMPO (8 items: I57-I64)
  // ============================================================================
  I57: {
    id: 'I57',
    name: 'Wind-Up Spring',
    emoji: '🌀',
    image: require('../../assets/icons/items/tempo/wind-up_spring.png'),
    baseRarity: 'COMMON',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'Turn 1: gain +1 SPD and +2 ATK (this battle)',
    },
  },
  I58: {
    id: 'I58',
    name: 'Ambush Charm',
    emoji: '🎯',
    image: require('../../assets/icons/items/tempo/ambush_charm.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If you act first on Turn 1, your first strike deals +3 damage',
    },
  },
  I59: {
    id: 'I59',
    name: 'Counterweight Buckle',
    emoji: '⚖️',
    image: require('../../assets/icons/items/tempo/counterweight_buckle.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If enemy acts first on Turn 1, gain 5 Armor before damage',
    },
  },
  I60: {
    id: 'I60',
    name: 'Hourglass Charge',
    emoji: '⏳',
    image: require('../../assets/icons/items/tempo/hourglass_charge.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn 5: gain +2 ATK and +1 SPD (this battle)',
    },
  },
  I61: {
    id: 'I61',
    name: 'Initiative Lens',
    emoji: '🔭',
    image: require('../../assets/icons/items/tempo/initiative_lens.png'),
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['TEMPO'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if your SPD > enemy SPD, gain 3 Armor',
    },
  },
  I62: {
    id: 'I62',
    name: 'Backstep Buckle',
    emoji: '🔙',
    image: require('../../assets/icons/items/tempo/backstep_buckle.png'),
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If enemy acts first on Turn 1, gain 4 Armor and your first strike deals +3 damage',
    },
  },
  I63: {
    id: 'I63',
    name: 'Tempo Battery',
    emoji: '🔋',
    image: require('../../assets/icons/items/tempo/tempo_battery.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn: gain +1 SPD (this battle)',
    },
  },
  I64: {
    id: 'I64',
    name: 'Second Wind Clock',
    emoji: '🕐',
    image: require('../../assets/icons/items/tempo/second_wind_clock.png'),
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn 5: heal 4 HP and gain +1 SPD (this battle)',
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
  GILDED: 2.0,
  DIAMOND: 4.0,
  RARE: 1.0,
  HEROIC: 1.0,
  MYTHIC: 1.0,
};

/**
 * Item tier for tier-scaled effects (I, II, III)
 */
export type ItemTier = 1 | 2 | 3;

/**
 * Derive tier from rarity: COMMON→T1, GILDED→T2, DIAMOND→T3
 */
export function getTierFromRarity(rarity: ItemRarity): ItemTier {
  switch (rarity) {
    case 'GILDED':
      return 2;
    case 'DIAMOND':
      return 3;
    default:
      return 1;
  }
}

/**
 * Get the effect description scaled to the item's current tier.
 * Replaces tier-1 values in the base description with the current tier's values
 * using the gear-effects data.
 */
export function getScaledEffectDescription(gearId: GearId, rarity: ItemRarity): string | null {
  const def = GEAR_DEFINITIONS[gearId];
  if (!def.effect) return null;

  const tier = getTierFromRarity(rarity);
  if (tier === 1) return def.effect.description;

  const gearEffects = GEAR_EFFECTS[gearId];
  if (!gearEffects || gearEffects.effects.length === 0) return def.effect.description;

  let description = def.effect.description;
  for (const effect of gearEffects.effects) {
    const baseValue = effect.values[0];
    const scaledValue = effect.values[tier - 1];
    if (baseValue !== scaledValue) {
      description = description.replace(
        new RegExp(`\\b${baseValue}\\b`),
        String(scaledValue)
      );
    }
  }

  return description;
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
