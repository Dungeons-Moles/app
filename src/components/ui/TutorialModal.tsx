import React, { useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { useControllerAction } from '../../hooks/useControllerAction';
import { useAudio } from '../../contexts/AudioContext';
import { ControllerHints, type ButtonHint } from './ControllerHints';
import { Typography } from '../../theme/typography';
import { TUTORIAL_SEEN_KEY, TOTAL_PAGES } from './tutorialPages';

const BOOK_BG = require('../../../assets/ui/backgrounds/book-compact.png');

// Character / entity images
const IMG_MOLE = require('../../../assets/entities/characters/default-mole.png');
const IMG_TUNNEL_RAT = require('../../../assets/entities/enemies/field/tunnel-rat.png');
const IMG_BROODMOTHER = require('../../../assets/entities/enemies/bosses/broodmother.png');

// Tile images
const IMG_FLOOR = require('../../../assets/world/tiles/floor-v1.png');
const IMG_ROCK = require('../../../assets/world/tiles/rock-v1.png');

// Stat icons
const ICON_HP = require('../../../assets/icons/stats/HP.png');
const ICON_ATK = require('../../../assets/icons/stats/ATK.png');
const ICON_ARM = require('../../../assets/icons/stats/ARM.png');
const ICON_SPD = require('../../../assets/icons/stats/speed.png');
const ICON_DIG = require('../../../assets/icons/stats/DIG.png');
const ICON_COIN = require('../../../assets/icons/ui/coin.png');

// UI icons
const ICON_SUN = require('../../../assets/icons/ui/sun.png');
const ICON_MOON = require('../../../assets/icons/ui/moon.png');
const ICON_SKULL = require('../../../assets/icons/ui/skull.png');
const ICON_MAP = require('../../../assets/icons/ui/map.png');

// POI icons
const ICON_MOLE_DEN = require('../../../assets/world/pois/mole-den.png');
const ICON_SUPPLY_CACHE = require('../../../assets/world/pois/supply-cache.png');
const ICON_TOOL_CRATE = require('../../../assets/world/pois/tool-crate.png');
const ICON_REST_ALCOVE = require('../../../assets/world/pois/rest-alcove.png');
const ICON_SMUGGLER = require('../../../assets/world/pois/smuggler-hatch.png');
const ICON_ANVIL = require('../../../assets/world/pois/rusty-anvil.png');
const ICON_RUNE_KILN = require('../../../assets/world/pois/rune-kiln.png');
const ICON_GEODE = require('../../../assets/world/pois/geode-vault.png');
const ICON_COUNTER_CACHE = require('../../../assets/world/pois/counter-cache.png');
const ICON_SCRAP_CHUTE = require('../../../assets/world/pois/scrap-chute.png');
const ICON_RAIL = require('../../../assets/world/pois/rail-waypoint.png');
const ICON_OIL_RACK = require('../../../assets/world/pois/tool-oil-rack.png');
const ICON_SURVEY = require('../../../assets/world/pois/survey-beacon.png');

// Controller button icons
const ICON_DPAD = require('../../../assets/ui/control-buttons/d-pad.png');
const ICON_BTN_A = require('../../../assets/ui/control-buttons/a.png');
const ICON_BTN_X = require('../../../assets/ui/control-buttons/x.png');
const ICON_BTN_Y = require('../../../assets/ui/control-buttons/y.png');
const ICON_BTN_L1 = require('../../../assets/ui/control-buttons/l1.png');
const ICON_BTN_R1 = require('../../../assets/ui/control-buttons/r1.png');
const ICON_BTN_SELECT = require('../../../assets/ui/control-buttons/select.png');
const ICON_BTN_START = require('../../../assets/ui/control-buttons/start.png');

// Itemset icons
const ICON_UNION_STANDARD = require('../../../assets/icons/itemsets/union_standard.png');
const ICON_SHARD_CIRCUIT = require('../../../assets/icons/itemsets/shard_circuit.png');
const ICON_DEMOLITION_PERMIT = require('../../../assets/icons/itemsets/demolition_permit.png');

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TutorialModal({ visible, onClose }: TutorialModalProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const variant = useScreenVariant();
  const isCompact = variant === 'compact';
  const { playSfx } = useAudio();

  const handleClose = useCallback(() => {
    AsyncStorage.setItem(TUTORIAL_SEEN_KEY, '1').catch(() => {});
    setCurrentPage(0);
    onClose();
  }, [onClose]);

  const turnPage = useCallback(
    (delta: number) => {
      setCurrentPage((prev) => {
        const next = prev + delta;
        if (next < 0 || next >= TOTAL_PAGES) return prev;
        playSfx('ui_page_turn');
        return next;
      });
    },
    [playSfx]
  );

  useControllerAction(
    {
      onDPadRight: () => turnPage(1),
      onDPadLeft: () => turnPage(-1),
      onB: handleClose,
      onSelect: handleClose,
    },
    visible
  );

  if (!visible) return null;

  const s = isCompact ? 2 : 1;

  // Icon sizes
  const iconSm = { width: 22 * s, height: 22 * s };
  const iconMd = { width: 32 * s, height: 32 * s };
  const iconLg = { width: 48 * s, height: 48 * s };
  const ctrlIcon = { width: 22 * s, height: 22 * s };

  const titleStyle = [
    txtStyles.title,
    { fontSize: isCompact ? 28 : 17, marginBottom: isCompact ? 8 : 5 },
  ];
  const bodyStyle = [
    txtStyles.body,
    { fontSize: isCompact ? 19 : 12, lineHeight: isCompact ? 26 : 17 },
  ];
  const smallStyle = [
    txtStyles.body,
    { fontSize: isCompact ? 17 : 11, lineHeight: isCompact ? 23 : 15 },
  ];
  const boldBody = [bodyStyle, { fontFamily: Typography.stat }].flat();
  const gap = isCompact ? 8 : 5;
  const smGap = isCompact ? 5 : 3;
  const rightPad = { paddingLeft: isCompact ? 56 : 34 };

  const controllerHints: ButtonHint[] = [
    { button: 'DPadLeftRight', label: 'Turn Page' },
    { button: 'B', label: 'Close' },
  ];

  const renderSpread = () => {
    switch (currentPage) {
      // ================================================================
      // PAGE 1: Welcome & Movement | Day/Night & Map
      // ================================================================
      case 0:
        return (
          <>
            <View style={pageStyles.page}>
              <Text style={titleStyle}>Welcome, Mole!</Text>
              <View style={pageStyles.centeredImage}>
                <Image source={IMG_MOLE} style={iconLg} resizeMode="contain" />
              </View>
              <Text style={bodyStyle}>
                Explore underground dungeons, fight enemies for Gold, visit Points of Interest for
                items, and defeat the weekly Boss. Beat all 3 bosses to clear the stage!
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Movement</Text>
              <View style={[pageStyles.row, { marginTop: smGap }]}>
                <Image source={ICON_DPAD} style={iconMd} resizeMode="contain" />
                <Text style={[bodyStyle, { flex: 1 }]}>
                  D-PAD moves one tile at a time. Each step costs 1 move.
                </Text>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={IMG_FLOOR} style={iconMd} resizeMode="contain" />
                <Text style={[bodyStyle, { flex: 1 }]}>Floor: walkable. Walk into enemies to fight.</Text>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={IMG_ROCK} style={iconMd} resizeMode="contain" />
                <Text style={[bodyStyle, { flex: 1 }]}>
                  Wall: press twice to dig. Cost: max(2, 6-DIG) moves.
                </Text>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image
                  source={ICON_BTN_SELECT}
                  style={{ width: 36 * s, height: 16 * s }}
                  resizeMode="contain"
                />
                <Text style={[smallStyle, { flex: 1, fontStyle: 'italic' }]}>
                  Press Select anytime to reopen this tutorial.
                </Text>
              </View>
            </View>
            <View style={[pageStyles.page, rightPad]}>
              <Text style={titleStyle}>Day & Night Cycle</Text>
              <Text style={bodyStyle}>
                Each week alternates Day and Night phases. Your movement budget and visibility change:
              </Text>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={ICON_SUN} style={iconMd} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={boldBody}>Day Phases</Text>
                  <Text style={smallStyle}>50 moves. See 4 tiles ahead.</Text>
                </View>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={ICON_MOON} style={iconMd} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={boldBody}>Night Phases</Text>
                  <Text style={smallStyle}>30 moves. See only 2 tiles. Enemies chase you!</Text>
                </View>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={ICON_SKULL} style={iconMd} resizeMode="contain" />
                <Text style={[bodyStyle, { flex: 1 }]}>
                  At the end of Night 3, a Boss Fight is triggered!
                </Text>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={ICON_MAP} style={iconMd} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={boldBody}>Map Overview</Text>
                  <View style={pageStyles.row}>
                    <Text style={smallStyle}>Press</Text>
                    <Image source={ICON_BTN_Y} style={{ width: 16 * s, height: 16 * s }} resizeMode="contain" />
                    <Text style={[smallStyle, { flex: 1 }]}>to open. D-PAD to pan. Y to close.</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        );

      // ================================================================
      // PAGE 2: Your Stats | Weeks/Bosses & Combat
      // ================================================================
      case 1:
        return (
          <>
            <View style={pageStyles.page}>
              <Text style={titleStyle}>Your Stats</Text>
              <Text style={[smallStyle, { marginBottom: gap }]}>
                All stats except HP and Gold come from your equipped Tool + Gear.
              </Text>
              <View style={[pageStyles.statList, { gap: isCompact ? 8 : 5 }]}>
                <StatRow
                  icon={ICON_HP}
                  label="HP"
                  desc="Health. Reach 0 and you die. Starts at 25. Does not regenerate between fights."
                  s={s}
                />
                <StatRow
                  icon={ICON_ATK}
                  label="ATK"
                  desc="Damage per strike. Hits enemy ARM first, excess carries to HP."
                  s={s}
                />
                <StatRow
                  icon={ICON_ARM}
                  label="ARM"
                  desc="Armor. Absorbs damage before HP. Resets to full after each fight."
                  s={s}
                />
                <StatRow
                  icon={ICON_SPD}
                  label="SPD"
                  desc="Speed. Higher SPD acts first. Every 2 SPD advantage = +1 bonus damage on first strike."
                  s={s}
                />
                <StatRow
                  icon={ICON_DIG}
                  label="DIG"
                  desc="Dig efficiency. Lowers wall cost. Also used in some combat checks."
                  s={s}
                />
                <StatRow
                  icon={ICON_COIN}
                  label="Gold"
                  desc="Earned from enemies. Spent at Shops, Anvils, and POIs. Start: 10."
                  s={s}
                />
              </View>
            </View>
            <View style={[pageStyles.page, rightPad]}>
              <Text style={titleStyle}>Weeks & Bosses</Text>
              <View style={pageStyles.centeredImage}>
                <Image source={IMG_BROODMOTHER} style={iconLg} resizeMode="contain" />
              </View>
              <Text style={smallStyle}>
                Each week: Day 1 {'\u2192'} Night 1 {'\u2192'} Day 2 {'\u2192'} Night 2 {'\u2192'}{' '}
                Day 3 {'\u2192'} Night 3 {'\u2192'}{' '}
                <Text style={{ fontFamily: Typography.stat }}>Boss!</Text>
                {'\n'}3 weeks per stage. Beat all 3 bosses to win.
              </Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                Bosses have 2 weakness tags. Items of those tags appear more often that week.
                Counter Caches offer items from the boss's exact weaknesses!
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Combat</Text>
              <View style={[pageStyles.row, { marginTop: smGap }]}>
                <Image source={IMG_TUNNEL_RAT} style={iconMd} resizeMode="contain" />
                <Text style={[smallStyle, { flex: 1 }]}>
                  Walk into enemies to auto-battle. Higher SPD acts first (ties: enemy). Damage hits
                  ARM first, then HP. Max 5 strikes/turn.
                </Text>
              </View>
              <Text style={[boldBody, { marginTop: gap }]}>Status Effects</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                {'\u2022'} Chill: -1 strike/turn, +1 dmg/stack (max +3){'\n'}
                {'\u2022'} Rust: Lose ARM = stacks end of turn. Persists!{'\n'}
                {'\u2022'} Bleed: Take dmg = stacks end of turn{'\n'}
                {'\u2022'} Shrapnel: Reflects dmg to attacker when struck
              </Text>
            </View>
          </>
        );

      // ================================================================
      // PAGE 3: Points of Interest (both sides)
      // ================================================================
      case 2:
        return (
          <>
            <View style={pageStyles.page}>
              <Text style={titleStyle}>Points of Interest</Text>
              <View style={pageStyles.row}>
                <Image source={ICON_BTN_A} style={iconSm} resizeMode="contain" />
                <Text style={[bodyStyle, { flex: 1 }]}>
                  Step onto a POI and press A to interact.
                </Text>
              </View>
              <View style={[pageStyles.statList, { marginTop: gap, gap: isCompact ? 7 : 4 }]}>
                <PoiRow
                  icon={ICON_MOLE_DEN}
                  name="Mole Den"
                  desc="Full heal + skip to Day. Night only. Repeatable."
                  s={s}
                />
                <PoiRow
                  icon={ICON_REST_ALCOVE}
                  name="Rest Alcove"
                  desc="Heal 10 HP + skip to Day. Night only. One-time."
                  s={s}
                />
                <PoiRow
                  icon={ICON_SUPPLY_CACHE}
                  name="Supply Cache"
                  desc="Pick 1 of 3 Gear items. Weighted to boss weakness tags."
                  s={s}
                />
                <PoiRow
                  icon={ICON_TOOL_CRATE}
                  name="Tool Crate"
                  desc="Pick 1 of 3 Tools. One-time."
                  s={s}
                />
                <PoiRow
                  icon={ICON_OIL_RACK}
                  name="Tool Oil Rack"
                  desc="Add +1 ATK, SPD, DIG, or ARM to your Tool. Once per tool."
                  s={s}
                />
                <PoiRow
                  icon={ICON_COUNTER_CACHE}
                  name="Counter Cache"
                  desc="Pick 1 of 3 items from the current boss's weakness tags!"
                  s={s}
                />
                <PoiRow
                  icon={ICON_SURVEY}
                  name="Survey Beacon"
                  desc="Reveal tiles in a large radius around you."
                  s={s}
                />
              </View>
            </View>
            <View style={[pageStyles.page, rightPad]}>
              <Text style={titleStyle}>More Locations</Text>
              <View style={[pageStyles.statList, { gap: isCompact ? 7 : 4 }]}>
                <PoiRow
                  icon={ICON_SMUGGLER}
                  name="Smuggler Hatch"
                  desc="Shop: buy Gear & Tools with Gold. Reroll stock for Gold (max 3)."
                  s={s}
                />
                <PoiRow
                  icon={ICON_ANVIL}
                  name="Rusty Anvil"
                  desc="Upgrade Tool tier: I→II (10g), II→III (20g)."
                  s={s}
                />
                <PoiRow
                  icon={ICON_RUNE_KILN}
                  name="Rune Kiln"
                  desc="Fuse 2 identical items → upgrade tier. Free!"
                  s={s}
                />
                <PoiRow
                  icon={ICON_GEODE}
                  name="Geode Vault"
                  desc="Pick 1 of 3 powerful Heroic items. One-time."
                  s={s}
                />
                <PoiRow
                  icon={ICON_SCRAP_CHUTE}
                  name="Scrap Chute"
                  desc="Destroy 1 Gear (4g cost). Refund by rarity."
                  s={s}
                />
                <PoiRow
                  icon={ICON_RAIL}
                  name="Rail Waypoint"
                  desc="Fast travel between discovered waypoints. Repeatable."
                  s={s}
                />
              </View>
              <Text style={[smallStyle, { marginTop: gap, fontStyle: 'italic' }]}>
                Night-only POIs (Mole Den, Rest Alcove) skip you to the next Day phase - use them to
                escape the dangerous night!
              </Text>
            </View>
          </>
        );

      // ================================================================
      // PAGE 4: Tools/Gear/Tags/Itemsets | Tips
      // ================================================================
      case 3:
        return (
          <>
            <View style={pageStyles.page}>
              <Text style={titleStyle}>Tools & Gear</Text>
              <Text style={boldBody}>Tool</Text>
              <Text style={smallStyle}>
                1 equipped at a time. Provides base ATK + a special combat effect. Upgrade at the Rusty
                Anvil or swap at Tool Crates.
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Gear</Text>
              <Text style={smallStyle}>
                Fills inventory slots. Start with 4. Beat W1 boss {'\u2192'} 6 slots. Beat W2 boss{' '}
                {'\u2192'} 8 slots. Upgrade tiers via Rune Kiln (fuse 2 identical, free) or at the
                Anvil (tools, costs Gold).
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Tags & Itemsets</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                Every item has a tag defining its combat style:{'\n'}
                {'\u2022'} STONE — Armor, Shrapnel{'\n'}
                {'\u2022'} SCOUT — DIG, multi-strike{'\n'}
                {'\u2022'} GREED — Gold, Shard effects{'\n'}
                {'\u2022'} BLAST — Bombs, non-weapon dmg{'\n'}
                {'\u2022'} FROST — Chill, SPD control{'\n'}
                {'\u2022'} RUST — Armor destruction{'\n'}
                {'\u2022'} BLOOD — Bleed, lifesteal{'\n'}
                {'\u2022'} TEMPO — SPD, Turn 1 burst
              </Text>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={ICON_UNION_STANDARD} style={iconSm} resizeMode="contain" />
                <Image source={ICON_SHARD_CIRCUIT} style={iconSm} resizeMode="contain" />
                <Image source={ICON_DEMOLITION_PERMIT} style={iconSm} resizeMode="contain" />
                <Text style={[smallStyle, { flex: 1 }]}>
                  Equip specific item combos for powerful set bonuses!
                </Text>
              </View>
            </View>
            <View style={[pageStyles.page, rightPad]}>
              <Text style={titleStyle}>Tips for New Players</Text>
              <Text style={boldBody}>Early Game</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                {'\u2022'} Visit Counter Caches early - they appear near your spawn{'\n'}
                {'\u2022'} Grab a Supply Cache or Tool Crate before your first fights{'\n'}
                {'\u2022'} Save Gold for the Smuggler Hatch shop
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Night Survival</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                {'\u2022'} Enemies move toward you at night - stay alert!{'\n'}
                {'\u2022'} Mole Dens give a full heal and skip to Day{'\n'}
                {'\u2022'} Rest Alcoves heal 10 HP and also skip to Day{'\n'}
                {'\u2022'} Plan your night routes toward a den or alcove
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Build Planning</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                {'\u2022'} Focus items around 1-2 tags for synergy{'\n'}
                {'\u2022'} ARM resets after each fight - it's very strong!{'\n'}
                {'\u2022'} Upgrade your Tool at the Anvil when you can{'\n'}
                {'\u2022'} SPD Advantage adds up: 4 SPD over enemy = +2 bonus dmg/turn{'\n'}
                {'\u2022'} Scrap Chute unwanted Gear to make room for better items{'\n'}
                {'\u2022'} Use the Rune Kiln to fuse duplicates into higher tiers
              </Text>
            </View>
          </>
        );

      // ================================================================
      // PAGE 5: Controls | Quick Reference
      // ================================================================
      case 4:
        return (
          <>
            <View style={pageStyles.page}>
              <Text style={titleStyle}>Controls</Text>
              <View style={[pageStyles.statList, { gap: isCompact ? 9 : 5 }]}>
                <ControlRow icon={ICON_DPAD} label="Move / Navigate menus" s={s} />
                <ControlRow icon={ICON_BTN_A} label="Interact with POIs / Confirm" s={s} />
                <ControlRow icon={ICON_BTN_X} label="Toggle sidebar (compact view)" s={s} />
                <ControlRow icon={ICON_BTN_SELECT} label="Reopen this tutorial" s={s} wide />
                <ControlRow icon={ICON_BTN_START} label="Pause menu" s={s} wide />
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={ICON_MAP} style={iconMd} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <View style={pageStyles.row}>
                    <Image source={ICON_BTN_Y} style={ctrlIcon} resizeMode="contain" />
                    <Text style={[bodyStyle, { flex: 1 }]}>Toggle map overview</Text>
                  </View>
                  <Text style={[smallStyle, { marginTop: smGap }]}>
                    Pan with D-PAD. Press Y again to close.
                  </Text>
                </View>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={ICON_BTN_L1} style={ctrlIcon} resizeMode="contain" />
                <Image source={ICON_BTN_R1} style={ctrlIcon} resizeMode="contain" />
                <Text style={[bodyStyle, { flex: 1 }]}>Focus inventory / enemy gear</Text>
              </View>
              <Text style={[smallStyle, { marginTop: smGap, marginLeft: isCompact ? 56 : 28 }]}>
                Navigate items with D-PAD, press A to inspect.
              </Text>
            </View>
            <View style={[pageStyles.page, rightPad]}>
              <Text style={titleStyle}>Quick Reference</Text>
              <Text style={boldBody}>Phase Moves</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                Day = 50 moves, Night = 30 moves{'\n'}
                6 phases per week, 3 weeks per stage
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Visibility</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                Day = 4 tiles, Night = 2 tiles
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Inventory</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                4 slots {'\u2192'} 6 (after W1 boss) {'\u2192'} 8 (after W2 boss)
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Enemy Gold</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                Tier 1 = 2g, Tier 2 = 4g, Tier 3 = 6g
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Dig Cost</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                max(2, 6 - DIG) moves per wall
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>SPD Advantage</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                Every 2 SPD over enemy = +1 bonus damage on first strike each turn
              </Text>
              <Text
                style={[
                  txtStyles.title,
                  {
                    fontSize: isCompact ? 24 : 15,
                    marginTop: isCompact ? 14 : 8,
                    textAlign: 'center',
                  },
                ]}
              >
                Good luck, mole!
              </Text>
            </View>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <View style={overlayStyles.overlay}>
      <Image source={BOOK_BG} style={overlayStyles.bookImage} resizeMode="stretch" />
      <View
        style={[
          overlayStyles.content,
          isCompact ? overlayStyles.contentCompact : overlayStyles.contentWide,
        ]}
      >
        <View style={[overlayStyles.columns, { gap: isCompact ? 32 : 16 }]}>{renderSpread()}</View>
        <Text
          style={[
            txtStyles.pageIndicator,
            { fontSize: isCompact ? 20 : 13, marginTop: isCompact ? 8 : 4 },
          ]}
        >
          {currentPage + 1} / {TOTAL_PAGES}
        </Text>
      </View>
      <ControllerHints hints={controllerHints} horizontal />
    </View>
  );
}

// --- Helper sub-components ---

function StatRow({
  icon,
  label,
  desc,
  s,
}: {
  icon: number;
  label: string;
  desc: string;
  s: number;
}) {
  const iconSize = { width: 20 * s, height: 20 * s };
  return (
    <View style={pageStyles.statRow}>
      <Image source={icon} style={iconSize} resizeMode="contain" />
      <Text style={[txtStyles.statLabel, { fontSize: s === 2 ? 18 : 11, minWidth: 28 * s }]}>
        {label}
      </Text>
      <Text
        style={[
          txtStyles.body,
          { fontSize: s === 2 ? 16 : 10, lineHeight: s === 2 ? 21 : 14, flex: 1 },
        ]}
      >
        {desc}
      </Text>
    </View>
  );
}

function PoiRow({
  icon,
  name,
  desc,
  s,
}: {
  icon: number;
  name: string;
  desc: string;
  s: number;
}) {
  const iconSize = { width: 30 * s, height: 30 * s };
  return (
    <View style={pageStyles.statRow}>
      <Image source={icon} style={iconSize} resizeMode="contain" />
      <View style={{ flex: 1 }}>
        <Text style={[txtStyles.statLabel, { fontSize: s === 2 ? 18 : 11 }]}>{name}</Text>
        <Text
          style={[
            txtStyles.body,
            { fontSize: s === 2 ? 16 : 10, lineHeight: s === 2 ? 20 : 13 },
          ]}
        >
          {desc}
        </Text>
      </View>
    </View>
  );
}

function ControlRow({
  icon,
  label,
  s,
  wide,
}: {
  icon: number;
  label: string;
  s: number;
  wide?: boolean;
}) {
  const iconSize = wide
    ? { width: 36 * s, height: 16 * s }
    : { width: 22 * s, height: 22 * s };
  return (
    <View style={[pageStyles.statRow, wide && { minHeight: 22 * s }]}>
      <View style={{ width: 36 * s, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={icon} style={iconSize} resizeMode="contain" />
      </View>
      <Text style={[txtStyles.body, { fontSize: s === 2 ? 19 : 12, flex: 1 }]}>{label}</Text>
    </View>
  );
}

// --- Styles ---

const overlayStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  contentWide: {
    paddingTop: 24,
    paddingHorizontal: 64,
    paddingBottom: 28,
  },
  contentCompact: {
    paddingTop: 130,
    paddingHorizontal: 88,
    paddingBottom: 160,
  },
  columns: {
    flexDirection: 'row',
  },
});

const pageStyles = StyleSheet.create({
  page: {
    flex: 1,
  },
  centeredImage: {
    alignItems: 'center',
    marginVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statList: {
    gap: 4,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

const txtStyles = StyleSheet.create({
  title: {
    fontFamily: Typography.header,
    color: '#3d2b1f',
    fontSize: 15,
    marginBottom: 5,
  },
  body: {
    fontFamily: Typography.body,
    color: '#5c4033',
    fontSize: 10,
    lineHeight: 14,
  },
  statLabel: {
    fontFamily: Typography.stat,
    color: '#3d2b1f',
    fontSize: 9,
  },
  pageIndicator: {
    fontFamily: Typography.header,
    color: '#8b7355',
    fontSize: 11,
    textAlign: 'center',
  },
});
