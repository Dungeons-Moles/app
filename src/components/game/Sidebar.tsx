/**
 * Sidebar Component - Combines BossPanel, StatsPanel, and InventoryPanel
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { CachedImageBackground } from '../common/CachedImageBackground';
import { PublicKey } from '@solana/web3.js';
import { StatsPanel } from './StatsPanel';
import { InventoryPanel } from './InventoryPanel';
import { FocusGlow } from '../ui/FocusGlow';
import { BossTooltipModal, type PvpDetails } from './BossTooltipModal';
import { getBoss } from '../../data/bosses';
import { getEntityImageSource } from './entityImages';
import { Typography } from '../../theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { useAudio } from '../../contexts/AudioContext';
import { useGameplayStateContext } from '../../contexts/GameplayStateContext';
import { useWallet } from '../../contexts/WalletContext';
import { useSolanaConnection } from '../../contexts/SolanaConnectionContext';
import { useSession } from '../../contexts/SessionContext';
import {
  createGameplayStateProgram,
  createPlayerProfileProgram,
} from '../../services/solana/programs';
import {
  derivePlayerProfilePda,
  deriveGauntletSessionPda,
  GAMEPLAY_STATE_PROGRAM_ID,
} from '../../services/solana/constants';
import { RunMode } from '../../services/solana/types/gameplay_state';
import { fetchGauntletEchoFromGameState } from '../../services/solana/gauntlet';
import { calculateItemStats } from '../../game/entities/items';
import {
  convertItemInstanceToGear,
  convertItemInstanceToTool,
} from '../../services/solana/pitDraft';
import { selectDuelWeekBossForSeed } from '../../game/time/progression';
import type {
  TimeState,
  PlayerStats,
  Tool,
  ToolOil,
  InventorySlot,
  ItemsetId,
  Gear,
} from '../../game/engine/types';
import { getTierFromRarity } from '../../data/gear';

const SIDEBAR_BG = require('../../../assets/ui/panels/sidebar.webp');
const BOSS_PANEL_BG = require('../../../assets/ui/panels/boss-panel.webp');
const DEFAULT_MOLE_IMAGE_SOURCE = require('../../../assets/entities/characters/default-mole.webp');
const SLOT_BG = require('../../../assets/ui/frames/square.webp');
const HP_ICON = require('../../../assets/icons/stats/HP.webp');
const ATK_ICON = require('../../../assets/icons/stats/ATK.webp');
const ARM_ICON = require('../../../assets/icons/stats/ARM.webp');
const SPD_ICON = require('../../../assets/icons/stats/speed.webp');
const DIG_ICON = require('../../../assets/icons/stats/DIG.webp');
const OIL_IMAGES: Record<ToolOil, any> = {
  ATK: require('../../../assets/icons/oils/ATK.webp'),
  DIG: require('../../../assets/icons/oils/DIG.webp'),
  SPD: require('../../../assets/icons/oils/SPD.webp'),
  ARM: require('../../../assets/icons/oils/ARM.webp'),
};
const SIDEBAR_DEBUG_LOGS = false;

function debugLog(...args: unknown[]) {
  if (__DEV__ && SIDEBAR_DEBUG_LOGS) {
    console.log(...args);
  }
}

/** Gauntlet gear capacity per week (starts at 4, gains 4 each week) */
function gauntletGearCapacity(week: number): number {
  return Math.min(4 + (week - 1) * 2, 12);
}

interface SidebarProps {
  time: TimeState;
  stats: PlayerStats;
  inventory: InventorySlot[];
  inventoryCapacity: number;
  maxGearSlots?: number;
  isGauntletLayout?: boolean;
  equippedTool: Tool | null;
  activeItemsets: ItemsetId[];
  onItemPress?: (item: Tool | Gear, slotIndex: number) => void;
  onItemInspect?: (item: Tool | Gear, slotIndex: number) => void;
  onToolInspect?: (tool: Tool) => void;
  onItemsetPress?: (id: ItemsetId) => void;
  isRuneKilnActive?: boolean;
  handleInventoryItemPress?: (item: Tool | Gear, slotIndex: number) => void;
  onlyBoss?: boolean;
  onlyContent?: boolean;
  scale?: number;
  floatingCompact?: boolean;
  compactBoss?: boolean;
  inlineBoss?: boolean;
  fitContentBoss?: boolean;
  controllerFocusIndex?: number | null;
  echoFocusIndex?: number | null;
  onEchoEquipmentLoaded?: (gear: Gear[], tool: Tool | null, slotCount: number) => void;
}

const GEAR_SLOT_SIZE = 28;
const TOOL_SLOT_SIZE = 42;

const EchoGearSlot = React.memo(function EchoGearSlot({ item, size = GEAR_SLOT_SIZE }: { item: Gear | null; size?: number }) {
  const tierBorder = useMemo(() => {
    if (!item) return null;
    const tier = getTierFromRarity(item.currentRarity);
    if (tier === 2) return '#4A90D9';
    if (tier === 3) return '#CC9900';
    return null;
  }, [item]);

  return (
    <CachedImageBackground
      source={SLOT_BG}
      style={[
        styles.echoSlot,
        { width: size, height: size },
        tierBorder && { borderWidth: 2, borderColor: tierBorder },
      ]}
      resizeMode="stretch"
    >
      {item &&
        (item.image ? (
          <Image source={item.image} style={{ width: size * 0.8, height: size * 0.8 }} contentFit="contain" />
        ) : (
          <Text style={{ fontSize: size * 0.5 }}>{item.emoji}</Text>
        ))}
    </CachedImageBackground>
  );
});

const EchoToolSlot = React.memo(function EchoToolSlot({ tool, size = TOOL_SLOT_SIZE }: { tool: Tool | null; size?: number }) {
  const tierBorder = useMemo(() => {
    if (!tool) return null;
    const tier = getTierFromRarity(tool.rarity);
    if (tier === 2) return '#4A90D9';
    if (tier === 3) return '#CC9900';
    return null;
  }, [tool]);

  return (
    <CachedImageBackground
      source={SLOT_BG}
      style={[
        styles.echoSlot,
        { width: size, height: size },
        tierBorder && { borderWidth: 2, borderColor: tierBorder },
      ]}
      resizeMode="stretch"
    >
      {tool &&
        (tool.image ? (
          <Image source={tool.image} style={{ width: size * 0.8, height: size * 0.8 }} contentFit="contain" />
        ) : (
          <Text style={{ fontSize: size * 0.5 }}>{tool.emoji}</Text>
        ))}
    </CachedImageBackground>
  );
});

function EchoOilSlot({ oil, size = TOOL_SLOT_SIZE }: { oil: ToolOil | null; size?: number }) {
  return (
    <CachedImageBackground
      source={SLOT_BG}
      style={[styles.echoSlot, { width: size, height: size }]}
      resizeMode="stretch"
    >
      {oil && (
        <Image source={OIL_IMAGES[oil]} style={{ width: size * 0.8, height: size * 0.8 }} contentFit="contain" />
      )}
    </CachedImageBackground>
  );
}

function EchoEquipmentGrid({ tool, gear, week, focusIndex }: { tool: Tool | null; gear: Gear[]; week: number; focusIndex?: number | null }) {
  const maxSlots = gauntletGearCapacity(week);
  // Build rows: 6 columns on wide (mobile) layout, 4 on compact
  const variant = useScreenVariant();
  const columnsPerRow = variant !== 'compact' ? 6 : 4;
  const rows: (Gear | null)[][] = [];
  for (let i = 0; i < maxSlots; i += columnsPerRow) {
    const row: (Gear | null)[] = [];
    for (let j = 0; j < columnsPerRow; j++) {
      row.push(gear[i + j] ?? null);
    }
    rows.push(row);
  }

  return (
    <View style={styles.echoEquipContainer}>
      {/* Gear grid */}
      <Text style={styles.echoSectionTitle}>
        GEAR ({Math.min(gear.length, maxSlots)}/{maxSlots})
      </Text>
      <View style={styles.echoGearGrid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.echoGearRow}>
            {row.map((g, ci) => {
              const slotIndex = ri * columnsPerRow + ci;
              return (
                <FocusGlow key={ci} active={focusIndex === slotIndex}>
                  <EchoGearSlot item={g} />
                </FocusGlow>
              );
            })}
          </View>
        ))}
      </View>

      {/* Weapon + Oil */}
      <View style={styles.echoToolSection}>
        <View style={styles.echoToolHeaderRow}>
          <View style={[styles.echoToolHeaderCell, { width: TOOL_SLOT_SIZE }]}>
            <Text style={styles.echoSectionTitle}>WEAPON</Text>
          </View>
          <View style={[styles.echoToolHeaderCell, { width: TOOL_SLOT_SIZE }]}>
            <Text style={styles.echoSectionTitle}>OIL</Text>
          </View>
        </View>
        <View style={styles.echoToolRow}>
          <FocusGlow active={focusIndex === maxSlots}>
            <EchoToolSlot tool={tool} />
          </FocusGlow>
          <EchoOilSlot oil={tool?.oil ?? null} />
        </View>
      </View>
    </View>
  );
}

export function BossPanel({
  time,
  scale = 1,
  compact = false,
  inline = false,
  fitContent = false,
  echoFocusIndex,
  onEchoEquipmentLoaded,
}: {
  time: TimeState;
  scale?: number;
  compact?: boolean;
  inline?: boolean;
  fitContent?: boolean;
  echoFocusIndex?: number | null;
  onEchoEquipmentLoaded?: (gear: Gear[], tool: Tool | null, slotCount: number) => void;
}) {
  const [modalVisible, setModalVisible] = useState(false);
  const [pvpDetails, setPvpDetails] = useState<PvpDetails | null>(null);
  const [pvpLoading, setPvpLoading] = useState(false);
  const { playSfx } = useAudio();
  const { gameState } = useGameplayStateContext();
  const { mapSeed, gameplayState: sessionGameState } = useSession();
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const boss = getBoss(time.weekBoss);
  // Use either context's gameState — SessionContext's instance is populated
  // earlier (during session start) while GameplayStateContext's may still be loading.
  const resolvedRunMode = gameState?.runMode ?? sessionGameState?.runMode;
  const resolvedWeek = gameState?.week ?? sessionGameState?.week ?? time.week;
  const isGauntletRun =
    resolvedRunMode === RunMode.Gauntlet ||
    gameState?.maxWeeks === 5 ||
    sessionGameState?.maxWeeks === 5;
  const isDuelRun = resolvedRunMode === RunMode.Duel;
  const isDuelFinalWeek = isDuelRun && resolvedWeek === 3;
  const duelWeekBoss = useMemo(() => {
    if (!isDuelRun || (resolvedWeek !== 1 && resolvedWeek !== 2)) return null;
    if (mapSeed == null) return null;
    const derivedBossId = selectDuelWeekBossForSeed(mapSeed, resolvedWeek);
    return getBoss(derivedBossId);
  }, [isDuelRun, mapSeed, resolvedWeek]);
  const displayedBoss = isDuelFinalWeek ? null : isDuelRun ? duelWeekBoss : boss;
  const shouldShowGauntletEcho = !displayedBoss && isGauntletRun;
  const shouldShowDuelOpponent = !displayedBoss && isDuelFinalWeek;

  const fetchProfileNameByWallet = useCallback(
    async (walletKey: string): Promise<string | null> => {
      try {
        const profileProgram = createPlayerProfileProgram(connection);
        const [profilePda] = derivePlayerProfilePda(new PublicKey(walletKey));
        const profile = await (
          profileProgram.account as {
            playerProfile: {
              fetchNullable: (address: unknown) => Promise<{ name?: unknown } | null>;
            };
          }
        ).playerProfile.fetchNullable(profilePda);
        if (!profile || typeof profile.name !== 'string') return null;
        const trimmed = (() => {
          const raw = profile.name;
          if (typeof raw !== 'string') return Buffer.from(raw as ArrayLike<number>).toString('utf-8').replace(/\0/g, '').trim();
          if (/^\d+(,\d+)*$/.test(raw)) return Buffer.from(raw.split(',').map(Number)).toString('utf-8').replace(/\0/g, '').trim();
          return raw.replace(/\0/g, '').trim();
        })();
        return trimmed.length > 0 ? trimmed : null;
      } catch {
        return null;
      }
    },
    [connection]
  );

  const gameStateWeek = gameState?.week;
  const loadPvpDetails = useCallback(async () => {
    if (!wallet.publicKey || displayedBoss || !isGauntletRun) {
      setPvpDetails({
        name: 'Mole Echo',
        sourceLabel: 'PvP Echo',
        tool: null,
        gear: [],
        stats: { hp: 15, atk: 1, arm: 0, spd: 0, dig: 0, gold: 0 },
        week: gameStateWeek ?? 1,
      });
      return;
    }

    setPvpLoading(true);
    try {
      const gameplayProgram = createGameplayStateProgram(connection);
      const week = gameStateWeek;

      if (week === undefined) {
        setPvpDetails({
          name: 'Mole Echo',
          sourceLabel: 'PvP Echo',
          tool: null,
          gear: [],
          stats: { hp: 15, atk: 1, arm: 0, spd: 0, dig: 0, gold: 0 },
          week: 1,
        });
        return;
      }

      // Derive game state PDA and read echo directly from the account's gauntletEchoes field.
      // This is the source of truth — echoes are drawn at enter_gauntlet time and stored here.
      const [gauntletSessionPda] = deriveGauntletSessionPda(wallet.publicKey);
      const [gameStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state'), gauntletSessionPda.toBuffer()],
        GAMEPLAY_STATE_PROGRAM_ID
      );

      const preview = await fetchGauntletEchoFromGameState(gameplayProgram, gameStatePda, week);

      if (!preview) {
        setPvpDetails({
          name: 'Mole Echo',
          sourceLabel: 'PvP Echo',
          tool: null,
          gear: [],
          stats: { hp: 15, atk: 1, arm: 0, spd: 0, dig: 0, gold: 0 },
          week,
        });
        return;
      }

      const tool = preview.tool ? convertItemInstanceToTool(preview.tool) : null;
      const gear = preview.gear
        .filter((g): g is NonNullable<typeof g> => g !== null)
        .map((g) => convertItemInstanceToGear(g))
        .filter((g): g is Gear => g !== null);
      const itemStats = calculateItemStats(tool, gear);

      debugLog('[BossPanel] Gauntlet echo preview decoded', {
        week,
        isBootstrap: preview.isBootstrap,
        sourcePlayer: preview.sourcePlayer?.toBase58?.() ?? null,
        toolDecoded: !!tool,
        gearDecodedCount: gear.length,
        goldAtBattleStart: preview.goldAtBattleStart,
      });

      let name = 'Mole Echo';
      let sourceLabel = 'Mole Echo';
      if (!preview.isBootstrap && preview.sourcePlayer) {
        const sourceWallet = preview.sourcePlayer.toBase58();
        const profileName = await fetchProfileNameByWallet(sourceWallet);
        name = profileName ?? sourceWallet.slice(0, 8);
        sourceLabel = 'Player Echo';
      }

      setPvpDetails({
        name,
        sourceLabel,
        tool,
        gear,
        stats: {
          hp: 15 + (itemStats.hp ?? 0),
          atk: 1 + (itemStats.atk ?? 0),
          arm: itemStats.arm ?? 0,
          spd: itemStats.spd ?? 0,
          dig: itemStats.dig ?? 0,
          gold: preview.goldAtBattleStart,
        },
        week,
      });
    } catch {
      setPvpDetails({
        name: 'Mole Echo',
        sourceLabel: 'PvP Echo',
        tool: null,
        gear: [],
        stats: { hp: 15, atk: 1, arm: 0, spd: 0, dig: 0, gold: 0 },
        week: gameStateWeek ?? 1,
      });
    } finally {
      setPvpLoading(false);
    }
  }, [
    displayedBoss,
    connection,
    fetchProfileNameByWallet,
    gameStateWeek,
    wallet.publicKey,
    isGauntletRun,
  ]);

  const handleBossPress = useCallback(() => {
    if (!displayedBoss && !shouldShowGauntletEcho) {
      return;
    }
    playSfx('ui_click');
    setModalVisible(true);
    if (!displayedBoss && shouldShowGauntletEcho) {
      void loadPvpDetails();
    }
  }, [displayedBoss, shouldShowGauntletEcho, loadPvpDetails, playSfx]);

  const handleBossClose = useCallback(() => {
    playSfx('ui_back');
    setModalVisible(false);
  }, [playSfx]);

  // Auto-load echo details for inline gauntlet view so stats render immediately
  const inlineLoadedWeekRef = useRef<number | null>(null);
  useEffect(() => {
    if (inline && shouldShowGauntletEcho && !pvpLoading && inlineLoadedWeekRef.current !== resolvedWeek) {
      inlineLoadedWeekRef.current = resolvedWeek;
      void loadPvpDetails();
    }
  }, [inline, shouldShowGauntletEcho, pvpLoading, resolvedWeek, loadPvpDetails]);

  // Lift echo equipment data to parent for controller A-button inspection
  useEffect(() => {
    if (inline && pvpDetails && onEchoEquipmentLoaded) {
      const gearCapacity = gauntletGearCapacity(pvpDetails.week ?? resolvedWeek);
      onEchoEquipmentLoaded(pvpDetails.gear, pvpDetails.tool, gearCapacity + 1);
    }
  }, [inline, pvpDetails, onEchoEquipmentLoaded, resolvedWeek]);

  const panelTitle = displayedBoss
    ? displayedBoss.name
    : shouldShowDuelOpponent
      ? 'Your Opponent'
      : shouldShowGauntletEcho
        ? (pvpDetails?.name ?? 'Mole Echo')
        : 'No Weekly Boss';
  const panelSubtitle =
    displayedBoss || shouldShowGauntletEcho
      ? 'Tap for details'
      : shouldShowDuelOpponent
        ? 'Build is hidden until duel resolves'
        : 'Duel final is at week end';

  debugLog('[BossPanel] render_mode', {
    hasBoss: !!displayedBoss,
    originalTimeWeekBoss: time.weekBoss ?? null,
    hasDuelWeekBoss: !!duelWeekBoss,
    gameRunMode: gameState?.runMode ?? null,
    gameMaxWeeks: gameState?.maxWeeks ?? null,
    gameCampaignLevel: gameState?.campaignLevel ?? null,
    isGauntletRun,
    isDuelFinalWeek,
    panelTitle,
  });

  if (inline) {
    const bossStats = displayedBoss?.stats;
    const echoStats = shouldShowGauntletEcho ? pvpDetails?.stats : null;
    const inlineStats = bossStats ?? echoStats;
    return (
      <View style={styles.inlineBossContainer}>
        <View style={styles.inlineBossHeader}>
          <Image
            source={
              displayedBoss ? getEntityImageSource(displayedBoss.id) : DEFAULT_MOLE_IMAGE_SOURCE
            }
            style={styles.inlineBossImage}
            contentFit={displayedBoss ? 'contain' : 'cover'}
          />
          <Text style={styles.inlineBossName} numberOfLines={1}>
            {panelTitle}
          </Text>
        </View>
        {inlineStats && (
          <>
            <View style={styles.inlineStatsRow}>
              <View style={styles.inlineStatsColumn}>
                <InlineStatRow icon={HP_ICON} label="HP" value={inlineStats.hp} />
                <InlineStatRow icon={ATK_ICON} label="ATK" value={inlineStats.atk} />
                <InlineStatRow icon={ARM_ICON} label="ARM" value={inlineStats.arm} />
              </View>
              <View style={styles.inlineStatsColumn}>
                <InlineStatRow icon={SPD_ICON} label="SPD" value={inlineStats.spd} />
                <InlineStatRow icon={DIG_ICON} label="DIG" value={inlineStats.dig ?? 0} />
              </View>
            </View>
            {displayedBoss?.abilities && displayedBoss.abilities.length > 0 && (
              <View style={styles.inlineAbilities}>
                {displayedBoss.abilities.map((ability, index) => (
                  <View key={index} style={styles.inlineAbilityItem}>
                    <Text style={styles.inlineAbilityName}>{ability.name}</Text>
                    <Text style={styles.inlineAbilityDesc}>{ability.description}</Text>
                  </View>
                ))}
              </View>
            )}
            {/* Echo equipment grid (gauntlet mode) — mirrors InventoryPanel layout */}
            {echoStats && pvpDetails && (
              <EchoEquipmentGrid
                tool={pvpDetails.tool}
                gear={pvpDetails.gear}
                week={pvpDetails.week ?? resolvedWeek}
                focusIndex={echoFocusIndex}
              />
            )}
          </>
        )}
      </View>
    );
  }

  return (
    <>
      {compact ? (
        <Pressable style={styles.bossCompactContainer} onPress={handleBossPress}>
          <Image
            source={
              displayedBoss ? getEntityImageSource(displayedBoss.id) : DEFAULT_MOLE_IMAGE_SOURCE
            }
            style={styles.bossCompactIcon}
            contentFit={displayedBoss ? 'contain' : 'cover'}
          />
          <Text style={styles.bossCompactName} numberOfLines={1}>
            {panelTitle}
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.bossContainer, fitContent && { width: undefined }, { paddingHorizontal: 6 * scale }]}>
          <CachedImageBackground
            source={BOSS_PANEL_BG}
            style={[styles.bossPanel, fitContent && { width: undefined }, { height: 50 * scale, paddingHorizontal: 10 * scale }]}
            resizeMode="stretch"
          >
            <Pressable style={[styles.bossContent, { gap: 8 * scale }]} onPress={handleBossPress}>
              <Image
                source={
                  displayedBoss ? getEntityImageSource(displayedBoss.id) : DEFAULT_MOLE_IMAGE_SOURCE
                }
                style={{ width: 42 * scale, height: 42 * scale }}
                contentFit={displayedBoss ? 'contain' : 'cover'}
              />
              <View>
                <Text style={[styles.bossName, { fontSize: 16 * scale }]}>
                  {panelTitle.length > 10 ? `${panelTitle.slice(0, 10)}...` : panelTitle}
                </Text>
                <Text style={[styles.bossDetailsText, { fontSize: 10 * scale }]}>
                  {panelSubtitle}
                </Text>
              </View>
            </Pressable>
          </CachedImageBackground>
        </View>
      )}
      <BossTooltipModal
        visible={modalVisible}
        boss={displayedBoss ?? null}
        pvpDetails={pvpDetails}
        pvpLoading={pvpLoading}
        onClose={handleBossClose}
      />
    </>
  );
}

export const Sidebar = React.memo(function Sidebar(props: SidebarProps) {
  const variant = useScreenVariant();
  const isCompact = variant === 'compact';

  if (props.onlyBoss) {
    return (
      <BossPanel
        time={props.time}
        scale={props.scale}
        compact={props.compactBoss}
        inline={props.inlineBoss}
        fitContent={props.fitContentBoss}
        echoFocusIndex={props.echoFocusIndex}
        onEchoEquipmentLoaded={props.onEchoEquipmentLoaded}
      />
    );
  }

  const isFloating = props.floatingCompact;
  const isWeb = Platform.OS === 'web';
  const screenH = Dimensions.get('window').height;
  const sidebarGap = isWeb ? 20 : Math.max(1, Math.round(screenH / 150));
  const handleItemTap = props.isRuneKilnActive
    ? props.handleInventoryItemPress
    : props.onItemInspect;
  const handleToolTap = props.isRuneKilnActive ? undefined : props.onToolInspect;
  const content = (
    <View
      style={[
        styles.innerContainer,
        { gap: sidebarGap },
        isFloating && { flex: 0, flexGrow: 0, padding: 14, paddingTop: 16, gap: 16 },
      ]}
    >
      {!props.onlyContent && <BossPanel time={props.time} />}

      <View style={styles.statsWrapper}>
        <StatsPanel stats={props.stats} isSidebar={true} />
      </View>

      <View style={[styles.inventoryWrapper, isFloating && { flex: 0, flexGrow: 0 }]}>
        <InventoryPanel
          inventory={props.inventory}
          equippedTool={props.equippedTool}
          inventoryCapacity={props.inventoryCapacity}
          maxGearSlots={props.maxGearSlots ?? 8}
          isGauntletLayout={props.isGauntletLayout}
          activeItemsets={props.activeItemsets}
          onItemPress={handleItemTap}
          onToolPress={handleToolTap}
          onItemInspect={props.onItemInspect}
          onToolInspect={props.onToolInspect}
          onItemsetPress={props.onItemsetPress}
          isSidebar={true}
          controllerFocusIndex={props.controllerFocusIndex}
        />
      </View>
    </View>
  );

  if (props.floatingCompact) {
    return content;
  }

  if (props.onlyContent) {
    return (
      <CachedImageBackground source={SIDEBAR_BG} style={styles.container} resizeMode="stretch">
        {content}
      </CachedImageBackground>
    );
  }

  return (
    <View style={styles.container}>
      <CachedImageBackground source={SIDEBAR_BG} style={styles.sidebarBg} resizeMode="stretch">
        {content}
      </CachedImageBackground>
    </View>
  );
});

function InlineStatRow({ icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <View style={styles.inlineStatRow}>
      <Image source={icon} style={styles.inlineStatIcon} contentFit="contain" />
      <Text style={styles.inlineStatLabel}>{label}</Text>
      <Text style={styles.inlineStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
  sidebarBg: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    padding: 10,
    paddingTop: 20,
    flexDirection: 'column',
    gap: 20,
  },
  bossContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  bossPanel: {
    width: '100%',
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  bossContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bossIcon: {
    width: 42,
    height: 42,
  },
  bossName: {
    fontFamily: Typography.header,
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
  },
  bossDetailsText: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: '#333333',
  },
  bossCompactContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  bossCompactIcon: {
    width: 72,
    height: 72,
  },
  bossCompactName: {
    fontFamily: Typography.header,
    fontSize: 18,
    color: '#000000',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  bossCompactSubtitle: {
    fontFamily: Typography.body,
    fontSize: 9,
    color: '#333333',
    textAlign: 'center',
  },
  statsWrapper: {
    flexShrink: 0,
  },
  inventoryWrapper: {
    flex: 1,
  },

  // Inline boss details (compact floating)
  inlineBossContainer: {
    padding: 14,
    paddingTop: 16,
    gap: 16,
  },
  inlineBossHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineBossImage: {
    width: 64,
    height: 64,
  },
  inlineBossName: {
    flex: 1,
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#000000',
    fontWeight: 'bold',
  },
  inlineStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 10,
  },
  inlineStatsColumn: {
    flex: 1,
    gap: 6,
  },
  inlineStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  inlineStatIcon: {
    width: 28,
    height: 28,
    tintColor: '#000000',
  },
  inlineStatLabel: {
    fontFamily: Typography.header,
    fontSize: 16,
    color: '#000000',
    width: 52,
    fontWeight: 'bold',
  },
  inlineStatValue: {
    fontFamily: Typography.number,
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
  },
  inlineAbilities: {
    gap: 6,
  },
  inlineAbilityItem: {
    gap: 2,
  },
  inlineAbilityName: {
    fontFamily: Typography.header,
    fontSize: 18,
    color: '#000000',
    fontWeight: 'bold',
  },
  inlineAbilityDesc: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#333333',
    lineHeight: 22,
  },
  echoEquipContainer: {
    gap: 4,
  },
  echoSectionTitle: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#000000',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  echoGearGrid: {
    gap: 6,
    marginVertical: 2,
  },
  echoGearRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  echoSlot: {
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  echoToolSection: {
    alignItems: 'stretch',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    marginTop: 4,
  },
  echoToolHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 4,
  },
  echoToolHeaderCell: {
    alignItems: 'center',
  },
  echoToolRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
});
