import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { CachedImageBackground } from '../common/CachedImageBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { useControllerAction } from '../../hooks/useControllerAction';
import { useInputMode } from '../../hooks/useInputMode';
import { useAudio } from '../../contexts/AudioContext';
import { ControllerHints, type ButtonHint } from './ControllerHints';
import { Typography } from '../../theme/typography';
import { TUTORIAL_SEEN_KEY, TOTAL_PAGES } from './tutorialPages';
import { CachedImage as Image } from '../common/CachedImage';
import { preloadCriticalImages } from '../../utils/preloadCriticalImages';

const BOOK_BG = require('../../../assets/ui/backgrounds/book-compact.webp');
const BUTTON_V1 = require('../../../assets/ui/buttons/button-v1.webp');
const ICON_NORMAL_SPEED = require('../../../assets/icons/ui/normal-speed.webp');
const BOSS_PANEL_BG = require('../../../assets/ui/panels/boss-panel.webp');

// Character / entity images
const IMG_MOLE = require('../../../assets/entities/characters/default-mole.webp');
const IMG_TUNNEL_RAT = require('../../../assets/entities/enemies/field/tunnel-rat.webp');
const IMG_TUNNEL_RAT_TIERS = require('../../../assets/entities/enemies/tunnel-rat-tiers.png');
const IMG_BROODMOTHER = require('../../../assets/entities/enemies/bosses/broodmother.webp');

// Tile images
const IMG_FLOOR = require('../../../assets/world/tiles/floor-v1.webp');
const IMG_ROCK = require('../../../assets/world/tiles/rock-v1.webp');

// Stat icons
const ICON_HP = require('../../../assets/icons/stats/HP.webp');
const ICON_ATK = require('../../../assets/icons/stats/ATK.webp');
const ICON_ARM = require('../../../assets/icons/stats/ARM.webp');
const ICON_SPD = require('../../../assets/icons/stats/speed.webp');
const ICON_DIG = require('../../../assets/icons/stats/DIG.webp');
const ICON_COIN = require('../../../assets/icons/ui/coin.webp');

// UI icons
const ICON_SUN = require('../../../assets/icons/ui/sun.webp');
const ICON_MOON = require('../../../assets/icons/ui/moon.webp');
const ICON_SKULL = require('../../../assets/icons/ui/skull.webp');
const ICON_MAP = require('../../../assets/icons/ui/map.webp');

// POI icons
const ICON_MOLE_DEN = require('../../../assets/world/pois/mole-den.webp');
const ICON_SUPPLY_CACHE = require('../../../assets/world/pois/supply-cache.webp');
const ICON_TOOL_CRATE = require('../../../assets/world/pois/tool-crate.webp');
const ICON_REST_ALCOVE = require('../../../assets/world/pois/rest-alcove.webp');
const ICON_SMUGGLER = require('../../../assets/world/pois/smuggler-hatch.webp');
const ICON_ANVIL = require('../../../assets/world/pois/rusty-anvil.webp');
const ICON_RUNE_KILN = require('../../../assets/world/pois/rune-kiln.webp');
const ICON_GEODE = require('../../../assets/world/pois/geode-vault.webp');
const ICON_COUNTER_CACHE = require('../../../assets/world/pois/counter-cache.webp');
const ICON_SCRAP_CHUTE = require('../../../assets/world/pois/scrap-chute.webp');
const ICON_RAIL = require('../../../assets/world/pois/rail-waypoint.webp');
const ICON_OIL_RACK = require('../../../assets/world/pois/tool-oil-rack.webp');
const ICON_SURVEY = require('../../../assets/world/pois/survey-beacon.webp');
const ICON_SEISMIC = require('../../../assets/world/pois/seismic-scanner.webp');

// Controller button icons
const ICON_DPAD = require('../../../assets/ui/control-buttons/d-pad.webp');
const ICON_BTN_A = require('../../../assets/ui/control-buttons/a.webp');
const ICON_BTN_X = require('../../../assets/ui/control-buttons/x.webp');
const ICON_BTN_Y = require('../../../assets/ui/control-buttons/y.webp');
const ICON_BTN_L1 = require('../../../assets/ui/control-buttons/l1.webp');
const ICON_BTN_R1 = require('../../../assets/ui/control-buttons/r1.webp');
const ICON_BTN_SELECT = require('../../../assets/ui/control-buttons/select.webp');
const ICON_BTN_START = require('../../../assets/ui/control-buttons/start.webp');

// Itemset icons
const ICON_UNION_STANDARD = require('../../../assets/icons/itemsets/union_standard.webp');
const ICON_SHARD_CIRCUIT = require('../../../assets/icons/itemsets/shard_circuit.webp');
const ICON_DEMOLITION_PERMIT = require('../../../assets/icons/itemsets/demolition_permit.webp');

const TUTORIAL_CRITICAL_IMAGES = [
  BOOK_BG,
  BUTTON_V1,
  ICON_NORMAL_SPEED,
  BOSS_PANEL_BG,
  IMG_MOLE,
  IMG_TUNNEL_RAT,
  IMG_TUNNEL_RAT_TIERS,
  IMG_BROODMOTHER,
  IMG_FLOOR,
  IMG_ROCK,
  ICON_HP,
  ICON_ATK,
  ICON_ARM,
  ICON_SPD,
  ICON_DIG,
  ICON_COIN,
  ICON_SUN,
  ICON_MOON,
  ICON_SKULL,
  ICON_MAP,
  ICON_MOLE_DEN,
  ICON_SUPPLY_CACHE,
  ICON_TOOL_CRATE,
  ICON_REST_ALCOVE,
  ICON_SMUGGLER,
  ICON_ANVIL,
  ICON_RUNE_KILN,
  ICON_GEODE,
  ICON_COUNTER_CACHE,
  ICON_SCRAP_CHUTE,
  ICON_RAIL,
  ICON_OIL_RACK,
  ICON_SURVEY,
  ICON_SEISMIC,
  ICON_DPAD,
  ICON_BTN_A,
  ICON_BTN_X,
  ICON_BTN_Y,
  ICON_BTN_L1,
  ICON_BTN_R1,
  ICON_BTN_SELECT,
  ICON_BTN_START,
  ICON_UNION_STANDARD,
  ICON_SHARD_CIRCUIT,
  ICON_DEMOLITION_PERMIT,
] as const;

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TutorialModal({ visible, onClose }: TutorialModalProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const variant = useScreenVariant();
  const isCompact = variant === 'compact';
  const isController = useInputMode() === 'controller';
  const { playSfx } = useAudio();

  useEffect(() => {
    if (!visible) return;
    preloadCriticalImages(TUTORIAL_CRITICAL_IMAGES);
  }, [visible]);

  const handleClose = useCallback(() => {
    playSfx('ui_back');
    AsyncStorage.setItem(TUTORIAL_SEEN_KEY, '1').catch(() => {});
    setCurrentPage(0);
    onClose();
  }, [onClose, playSfx]);

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

  // On native phones, scale down based on screen height (seeker/browser looks good as-is)
  const isNative = Platform.OS !== 'web';
  const screenH = Dimensions.get('window').height;
  // Reference height where s=1 looks good (~500px landscape). Scale down for shorter screens.
  const nativeScale = isNative && !isCompact ? Math.min(1, screenH / 500) : 1;
  const ns = (v: number) => Math.round(v * nativeScale);

  // Icon sizes
  const iconSm = { width: ns(22 * s), height: ns(22 * s) };
  const iconMd = { width: ns(32 * s), height: ns(32 * s) };
  const iconLg = { width: ns(48 * s), height: ns(48 * s) };
  const ctrlIcon = { width: ns(22 * s), height: ns(22 * s) };

  const titleStyle = [
    txtStyles.title,
    { fontSize: ns(isCompact ? 28 : 15), marginBottom: ns(isCompact ? 8 : 4) },
  ];
  const bodyStyle = [
    txtStyles.body,
    { fontSize: ns(isCompact ? 19 : 10.5), lineHeight: ns(isCompact ? 26 : 15) },
  ];
  const smallStyle = [
    txtStyles.body,
    { fontSize: ns(isCompact ? 17 : 9.5), lineHeight: ns(isCompact ? 23 : 13) },
  ];
  const boldBody = [bodyStyle, { fontFamily: Typography.stat }].flat();
  const gap = ns(isCompact ? 8 : 5);
  const smGap = ns(isCompact ? 5 : 3);
  const rightPad = { paddingLeft: ns(isCompact ? 56 : 34) };

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
              <Text style={[titleStyle, !isCompact && { marginBottom: 0 }]}>Welcome, Mole!</Text>
              <View style={[pageStyles.centeredImage, !isCompact && { marginVertical: 0 }]}>
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
                  Wall: press twice to dig. Cost: 6-DIG moves (min 2).
                </Text>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                {isCompact ? (
                  <Image
                    source={ICON_BTN_SELECT}
                    style={{ width: 36 * s, height: 16 * s }}
                    resizeMode="contain"
                  />
                ) : (
                  <Image
                    source={require('../../../assets/ui/illustrations/engine.webp')}
                    style={{ width: 32, height: 32 }}
                    resizeMode="contain"
                  />
                )}
                <Text style={[smallStyle, { flex: 1, fontStyle: 'italic' }]}>
                  {isCompact
                    ? 'Press Select anytime to reopen this tutorial.'
                    : 'Reopen this tutorial anytime from the pause menu.'}
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
                <View style={{ flex: 1 }}>
                  <Text style={boldBody}>Boss Phases</Text>
                  <Text style={smallStyle}>At the end of Night 3, a Boss Fight is triggered!</Text>
                </View>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={ICON_MAP} style={iconMd} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={boldBody}>Map Overview</Text>
                  {isCompact ? (
                    <View style={pageStyles.row}>
                      <Text style={smallStyle}>Press</Text>
                      <Image source={ICON_BTN_Y} style={{ width: 16 * s, height: 16 * s }} resizeMode="contain" />
                      <Text style={[smallStyle, { flex: 1 }]}>to open. D-PAD to pan. Y to close.</Text>
                    </View>
                  ) : (
                    <Text style={smallStyle}>
                      Press the map icon to open, scroll the map to pan and pinch to zoom. Press
                      the map again to close.
                    </Text>
                  )}
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
                  desc="Health. Reach 0 and you die. Does not regenerate between fights."
                  s={s}
                  ns={ns}
                />
                <StatRow
                  icon={ICON_ATK}
                  label="ATK"
                  desc="Damage per strike. Hits enemy ARM first, excess carries to HP."
                  s={s}
                  ns={ns}
                />
                <StatRow
                  icon={ICON_ARM}
                  label="ARM"
                  desc="Armor. Absorbs damage before HP. Resets to full after each fight."
                  s={s}
                  ns={ns}
                />
                <StatRow
                  icon={ICON_SPD}
                  label="SPD"
                  desc="Speed. Higher SPD acts first. 5+ SPD over enemy = 1 extra strike per turn."
                  s={s}
                  ns={ns}
                />
                <StatRow
                  icon={ICON_DIG}
                  label="DIG"
                  desc="Dig efficiency. Lowers wall cost. Also used in some combat checks."
                  s={s}
                  ns={ns}
                />
                <StatRow
                  icon={ICON_COIN}
                  label="Gold"
                  desc="Earned from enemies. Spent at Shops, Anvils, and POIs."
                  s={s}
                  ns={ns}
                />
              </View>
            </View>
            <View style={[pageStyles.page, rightPad]}>
              <Text style={[titleStyle, !isCompact && { marginBottom: 0 }]}>Weeks & Bosses</Text>
              <View style={!isCompact && { flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[pageStyles.centeredImage, !isCompact && { marginVertical: 0 }]}>
                  <Image source={IMG_BROODMOTHER} style={iconLg} resizeMode="contain" />
                </View>
                <Text style={[smallStyle, !isCompact && { flex: 1 }]}>
                  Each week: Day 1 {'\u2192'} Night 1 {'\u2192'} Day 2 {'\u2192'} Night 2 {'\u2192'}{' '}
                  Day 3 {'\u2192'} Night 3 {'\u2192'}{' '}
                  <Text style={{ fontFamily: Typography.stat }}>Boss!</Text>
                  {'\n'}3 weeks per stage. Beat all 3 bosses to win.
                </Text>
              </View>
              <Text style={[boldBody, { marginTop: gap }]}>Combat</Text>
              <View style={[pageStyles.row, { marginTop: smGap }]}>
                <Image source={IMG_TUNNEL_RAT} style={iconMd} resizeMode="contain" />
                <Text style={[smallStyle, { flex: 1 }]}>
                  Walk into enemies to auto-battle. Higher SPD acts first (ties: enemy). Damage hits
                  ARM first, then HP. Max 5 strikes/turn.
                </Text>
              </View>
              <Text style={[boldBody, { marginTop: smGap }]}>Enemy Tiers</Text>
              {isCompact ? (
                <>
                  <View style={[pageStyles.centeredImage, { marginVertical: smGap }]}>
                    <Image
                      source={IMG_TUNNEL_RAT_TIERS}
                      style={{ width: 240 * s, height: 60 * s }}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={smallStyle}>
                    Enemies come in 3 tiers. Higher tiers have better stats and give more Gold (2g / 4g / 6g).
                  </Text>
                </>
              ) : (
                <View style={[pageStyles.row, { marginTop: smGap }]}>
                  <Image
                    source={IMG_TUNNEL_RAT_TIERS}
                    style={{ width: ns(120), height: ns(30) }}
                    resizeMode="contain"
                  />
                  <Text style={[smallStyle, { flex: 1 }]}>
                    3 tiers. Higher tiers have better stats and give more Gold (2g / 4g / 6g).
                  </Text>
                </View>
              )}
              <Text style={[boldBody, { marginTop: gap }]}>Status Effects</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                {'\u2022'} Chill: -1 strike/turn, +1 dmg/stack (max +3){'\n'}
                {'\u2022'} Rust: Lose ARM = stacks end of turn. Persists!{'\n'}
                {'\u2022'} Bleed: Take dmg = stacks end of turn{'\n'}
                {'\u2022'} Shrapnel: Consumes 1 stack when struck.{'\n'}{'   '}Reflects half ATK back
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
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_REST_ALCOVE}
                  name="Rest Alcove"
                  desc="Heal 10 HP + skip to Day. Night only. One-time."
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_SUPPLY_CACHE}
                  name="Supply Cache"
                  desc="Pick 1 of 3 Gear items. Weighted to boss weakness tags."
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_TOOL_CRATE}
                  name="Tool Crate"
                  desc="Pick 1 of 3 Tools. One-time."
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_OIL_RACK}
                  name="Tool Oil Rack"
                  desc="Add +1 ATK, SPD, DIG, or ARM to your Tool. Once per tool."
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_COUNTER_CACHE}
                  name="Counter Cache"
                  desc="Pick 1 of 3 items from the current boss's weakness tags!"
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_SURVEY}
                  name="Survey Beacon"
                  desc="Reveal tiles in a large radius around you."
                  s={s}
                  ns={ns}
                />
              </View>
            </View>
            <View style={[pageStyles.page, rightPad]}>
              <Text style={titleStyle}>More Locations</Text>
              <View style={[pageStyles.statList, { gap: isCompact ? 7 : 4 }]}>
                <PoiRow
                  icon={ICON_SEISMIC}
                  name="Seismic Scanner"
                  desc="Choose a POI type to reveal the nearest undiscovered instance of that type."
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_SMUGGLER}
                  name="Smuggler Hatch"
                  desc="Shop: buy Gear & Tools with Gold. Reroll stock for Gold (max 3)."
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_ANVIL}
                  name="Rusty Anvil"
                  desc="Upgrade Tool tier: I→II (10g), II→III (20g)."
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_RUNE_KILN}
                  name="Rune Kiln"
                  desc="Fuse 2 identical items → upgrade tier. Free!"
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_GEODE}
                  name="Geode Vault"
                  desc="Pick 1 of 3 powerful Heroic items. One-time."
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_SCRAP_CHUTE}
                  name="Scrap Chute"
                  desc="Destroy 1 Gear (4g cost). Refund by rarity."
                  s={s}
                  ns={ns}
                />
                <PoiRow
                  icon={ICON_RAIL}
                  name="Rail Waypoint"
                  desc={`Fast travel between discovered waypoints.\nRepeatable.`}
                  s={s}
                  ns={ns}
                />
              </View>
              {isCompact && (
                <Text style={[smallStyle, { marginTop: gap, fontStyle: 'italic' }]}>
                  Night-only POIs (Mole Den, Rest Alcove) skip you to the next Day phase - use them to
                  escape the dangerous night!
                </Text>
              )}
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
              {isCompact ? (
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
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: smGap, gap: 3 }}>
                  {[
                    { tag: 'STONE', desc: 'Armor, Shrapnel' },
                    { tag: 'SCOUT', desc: 'DIG, multi-strike' },
                    { tag: 'GREED', desc: 'Gold, Shard effects' },
                    { tag: 'BLAST', desc: 'Bombs, non-weapon dmg' },
                    { tag: 'FROST', desc: 'Chill, SPD control' },
                    { tag: 'RUST', desc: 'Armor destruction' },
                    { tag: 'BLOOD', desc: 'Bleed, lifesteal' },
                    { tag: 'TEMPO', desc: 'SPD, Turn 1 burst' },
                  ].map(({ tag, desc }) => (
                    <Text key={tag} style={[smallStyle, { width: '48%' }]}>
                      <Text style={{ fontFamily: Typography.stat }}>{tag}</Text>{': '}{desc}
                    </Text>
                  ))}
                </View>
              )}
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
                {'\u2022'} Tap the skull icon in the top bar to skip straight to the boss fight
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>Build Planning</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                {'\u2022'} ARM resets after each fight - it's very strong!{'\n'}
                {'\u2022'} Upgrade your Tool at the Anvil when you can{'\n'}
                {'\u2022'} 5+ SPD over enemy grants an extra strike per turn{'\n'}
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
                <ControlRow icon={ICON_DPAD} label="Move / Navigate menus" s={s} ns={ns} />
                <ControlRow icon={ICON_BTN_A} label="Interact with POIs / Confirm" s={s} ns={ns} />
                {isCompact && (
                  <ControlRow icon={ICON_BTN_X} label="Toggle sidebar" s={s} ns={ns} />
                )}
                <ControlRow
                  icon={isCompact ? ICON_BTN_START : require('../../../assets/ui/illustrations/engine.webp')}
                  label={isCompact ? "Pause menu." : "Pause menu. You can reopen this tutorial from there."}
                  s={s}
                  ns={ns}
                  wide={isCompact}
                />
                <View style={pageStyles.statRow}>
                  <CachedImageBackground
                    source={BOSS_PANEL_BG}
                    style={{ width: 90 * s, height: 24 * s, justifyContent: 'center', paddingHorizontal: 4 * s }}
                    resizeMode="stretch"
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 * s }}>
                      <Image source={IMG_BROODMOTHER} style={{ width: 22 * s, height: 22 * s }} resizeMode="contain" />
                      <View>
                        <Text style={{ fontFamily: Typography.header, fontSize: s === 2 ? 14 : 8, color: '#000' }}>
                          Broodmother
                        </Text>
                        <Text style={{ fontFamily: Typography.body, fontSize: s === 2 ? 10 : 6, color: '#333' }}>
                          Tap for details
                        </Text>
                      </View>
                    </View>
                  </CachedImageBackground>
                  <Text style={[txtStyles.body, { fontSize: s === 2 ? 19 : 12, flex: 1 }]}>
                    Tap boss panel to view boss info
                  </Text>
                </View>
              </View>
              <View style={[pageStyles.row, { marginTop: gap }]}>
                <Image source={ICON_MAP} style={iconMd} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  {isCompact && (
                    <View style={pageStyles.row}>
                      <Image source={ICON_BTN_Y} style={ctrlIcon} resizeMode="contain" />
                      <Text style={[bodyStyle, { flex: 1 }]}>Toggle map overview</Text>
                    </View>
                  )}
                  <Text style={[smallStyle, { marginTop: isCompact ? smGap : 0 }]}>
                    {isCompact
                      ? 'Pan with D-PAD. Press Y again to close.'
                      : 'Scroll to pan, pinch to zoom. Press again to close.'}
                  </Text>
                </View>
              </View>
              {isCompact && (
                <View style={[pageStyles.row, { marginTop: gap }]}>
                  <Image source={ICON_BTN_L1} style={ctrlIcon} resizeMode="contain" />
                  <Image source={ICON_BTN_R1} style={ctrlIcon} resizeMode="contain" />
                  <Text style={[bodyStyle, { flex: 1 }]}>Focus inventory / enemy gear</Text>
                </View>
              )}
              <Text style={[smallStyle, { marginTop: smGap, marginLeft: isCompact ? 56 : 28 }]}>
                Press inventory/enemy gear to inspect.
              </Text>
            </View>
            <View style={[pageStyles.page, rightPad]}>
              <Text style={titleStyle}>Quick Reference</Text>
              <Text style={boldBody}>Phase Moves</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                {isCompact
                  ? `Day = 50 moves, Night = 30 moves\n6 phases per week, 3 weeks per stage`
                  : `Day: 50 moves, Night: 50 moves . 6 phases/week, 3 weeks/stage`}
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
                6-DIG moves per wall (minimum 2)
              </Text>
              <Text style={[boldBody, { marginTop: gap }]}>SPD Advantage</Text>
              <Text style={[smallStyle, { marginTop: smGap }]}>
                5+ SPD over enemy = 1 extra strike per turn
              </Text>
              {isCompact && (
                <Text
                  style={[
                    txtStyles.title,
                    { fontSize: 24, marginTop: 14, textAlign: 'center' },
                  ]}
                >
                  Good luck, mole!
                </Text>
              )}
            </View>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <TouchableOpacity
      style={overlayStyles.overlay}
      onPress={!isCompact && !isController ? handleClose : undefined}
      activeOpacity={1}
    >
      <Image source={BOOK_BG} style={overlayStyles.bookImage} resizeMode="stretch" />
      <View
        style={[
          overlayStyles.content,
          isCompact ? overlayStyles.contentCompact : overlayStyles.contentWide,
          isNative && !isCompact && {
            overflow: 'hidden',
            paddingTop: ns(24),
            paddingHorizontal: ns(64),
            paddingBottom: ns(28),
          },
        ]}
      >
        <View style={[overlayStyles.columns, { gap: ns(isCompact ? 32 : 16) }]}>{renderSpread()}</View>
      </View>
      <Text
        style={[
          overlayStyles.pageIndicatorAbsolute,
          { fontSize: isCompact ? 20 : 18 },
        ]}
      >
        {currentPage + 1} / {TOTAL_PAGES}
      </Text>
      {!isController && !isCompact && currentPage === 4 && (
        <Text style={[txtStyles.title, { position: 'absolute', top: 60, right: 52, fontSize: 13 }]}>
          Good luck, mole!
        </Text>
      )}
      {!isController && (
        <View style={overlayStyles.pageNavButtons}>
          <Text style={overlayStyles.tapToClose}>Tap anywhere to close</Text>
          <TouchableOpacity
            onPress={() => turnPage(-1)}
            activeOpacity={currentPage === 0 ? 1 : 0.7}
            style={currentPage === 0 && overlayStyles.pageNavBtnDisabled}
          >
            <CachedImageBackground source={BUTTON_V1} style={overlayStyles.pageNavBtn} resizeMode="stretch">
              <Image source={ICON_NORMAL_SPEED} style={[overlayStyles.pageNavIcon, { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
            </CachedImageBackground>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => turnPage(1)}
            activeOpacity={currentPage === TOTAL_PAGES - 1 ? 1 : 0.7}
            style={currentPage === TOTAL_PAGES - 1 && overlayStyles.pageNavBtnDisabled}
          >
            <CachedImageBackground source={BUTTON_V1} style={overlayStyles.pageNavBtn} resizeMode="stretch">
              <Image source={ICON_NORMAL_SPEED} style={overlayStyles.pageNavIcon} resizeMode="contain" />
            </CachedImageBackground>
          </TouchableOpacity>
        </View>
      )}
      <ControllerHints hints={controllerHints} horizontal />
    </TouchableOpacity>
  );
}

// --- Helper sub-components ---

function StatRow({
  icon,
  label,
  desc,
  s,
  ns,
}: {
  icon: number;
  label: string;
  desc: string;
  s: number;
  ns: (v: number) => number;
}) {
  const iconSize = { width: ns(20 * s), height: ns(20 * s) };
  return (
    <View style={pageStyles.statRow}>
      <Image source={icon} style={iconSize} resizeMode="contain" />
      <Text style={[txtStyles.statLabel, { fontSize: ns(s === 2 ? 18 : 11), minWidth: ns(28 * s) }]}>
        {label}
      </Text>
      <Text
        style={[
          txtStyles.body,
          { fontSize: ns(s === 2 ? 16 : 10), lineHeight: ns(s === 2 ? 21 : 14), flex: 1 },
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
  ns,
}: {
  icon: number;
  name: string;
  desc: string;
  s: number;
  ns: (v: number) => number;
}) {
  const iconSize = { width: ns(30 * s), height: ns(30 * s) };
  return (
    <View style={pageStyles.statRow}>
      <Image source={icon} style={iconSize} resizeMode="contain" />
      <View style={{ flex: 1 }}>
        <Text style={[txtStyles.statLabel, { fontSize: ns(s === 2 ? 18 : 11) }]}>{name}</Text>
        <Text
          style={[
            txtStyles.body,
            { fontSize: ns(s === 2 ? 16 : 10), lineHeight: ns(s === 2 ? 20 : 13) },
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
  ns,
}: {
  icon: number;
  label: string;
  s: number;
  wide?: boolean;
  ns: (v: number) => number;
}) {
  const iconSize = wide
    ? { width: ns(36 * s), height: ns(16 * s) }
    : { width: ns(22 * s), height: ns(22 * s) };
  return (
    <View style={[pageStyles.statRow, wide && { minHeight: ns(22 * s) }]}>
      <View style={{ width: ns(36 * s), alignItems: 'center', justifyContent: 'center' }}>
        <Image source={icon} style={iconSize} resizeMode="contain" />
      </View>
      <Text style={[txtStyles.body, { fontSize: ns(s === 2 ? 19 : 12), flex: 1 }]}>{label}</Text>
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
  pageIndicatorAbsolute: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    fontFamily: Typography.header,
    color: '#8b7355',
    textAlign: 'center',
  },
  pageNavButtons: {
    position: 'absolute',
    bottom: 65,
    right: 45,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  tapToClose: {
    fontFamily: Typography.header,
    fontSize: 11,
    color: '#8b7355',
    marginRight: 4,
  },
  pageNavBtn: {
    width: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageNavBtnDisabled: {
    opacity: 0.3,
  },
  pageNavIcon: {
    width: 18,
    height: 18,
    marginBottom: 3,
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
