import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CachedImageBackground } from '../components/common/CachedImageBackground';
import { CachedImage } from '../components/common/CachedImage';
import type { RootStackParamList, CombatParams } from '../navigation';
import { Typography } from '../theme/typography';
import {
  TOOL_DEFINITIONS,
  calculateCombatBakedItemStats,
  createGearInstance,
  createToolInstance,
  getToolStatsAtTier,
} from '@/game/entities/items';
import { GEAR_DEFINITIONS, type ItemTier } from '@/data/gear';
import type {
  BossId,
  CombatantState,
  Gear,
  GearId,
  ItemsetId,
  ItemStats,
  ItemTag,
  Tool,
  ToolId,
  ToolOil,
} from '@/game/engine/types';
import { getActiveItemsets } from '@/game/entities/itemsets';
import { BOSSES } from '@/data/bosses';
import { ENEMY_DEFINITIONS, calculateGoldReward } from '@/game/entities/enemies';
import type { EnemyId } from '@/game/map/types';
import { ENEMY_IMAGES, BOSS_IMAGES } from '@/components/game/entityImages';
import { InlineModal } from '@/components/InlineModal';
import { useInputMode } from '@/hooks/useInputMode';
import { useControllerAction } from '@/hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '@/components/ui/ControllerHints';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.webp');
const BACK_BUTTON_IMAGE = require('../../assets/ui/buttons/button-v1.webp');

type BattleSimulatorScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'BattleSimulator'>;
};

type EnemyMode = 'field' | 'boss' | 'mole';
type SelectorState =
  | { kind: 'playerTool' | 'enemyTool' | 'playerGear' | 'enemyGear' | 'fieldEnemy' | 'boss' }
  | null;

type ToolSelection = {
  id: ToolId;
  tier: ItemTier;
  oil: ToolOil | null;
} | null;

type GearSelection = {
  key: string;
  id: GearId;
  tier: ItemTier;
};

const TIER_RARITY = {
  1: 'COMMON',
  2: 'GILDED',
  3: 'DIAMOND',
} as const;

const TIER_LABELS: Record<ItemTier, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
};

const TOOL_OILS: Array<ToolOil | null> = [null, 'ATK', 'ARM', 'SPD', 'DIG'];
const DEFAULT_TOOL_SELECTION: ToolSelection = { id: 'T0', tier: 1, oil: null };
const GEAR_TAGS: ItemTag[] = ['STONE', 'SCOUT', 'GREED', 'BLAST', 'FROST', 'RUST', 'BLOOD', 'TEMPO'];

export function BattleSimulatorScreen({ navigation }: BattleSimulatorScreenProps) {
  const inputMode = useInputMode();
  const isCompact = useScreenVariant() === 'compact';
  const isController = inputMode === 'controller';
  const s = isCompact ? 1.5 : 1;
  const gearKeyRef = useRef(0);
  const [selector, setSelector] = useState<SelectorState>(null);
  const [playerStartingHpInput, setPlayerStartingHpInput] = useState('20');
  const [playerHpInput, setPlayerHpInput] = useState('20');
  const [playerGoldInput, setPlayerGoldInput] = useState('0');
  const [playerTool, setPlayerTool] = useState<ToolSelection>(DEFAULT_TOOL_SELECTION);
  const [playerGear, setPlayerGear] = useState<GearSelection[]>([]);

  const [enemyMode, setEnemyMode] = useState<EnemyMode>('field');
  const [fieldEnemyId, setFieldEnemyId] = useState<EnemyId>('TUNNEL_RAT');
  const [fieldEnemyTier, setFieldEnemyTier] = useState<ItemTier>(1);
  const [bossId, setBossId] = useState<BossId>('B-A-W1-01');
  const [enemyStartingHpInput, setEnemyStartingHpInput] = useState('20');
  const [enemyHpInput, setEnemyHpInput] = useState('20');
  const [enemyGoldInput, setEnemyGoldInput] = useState('0');
  const [enemyTool, setEnemyTool] = useState<ToolSelection>(DEFAULT_TOOL_SELECTION);
  const [enemyGear, setEnemyGear] = useState<GearSelection[]>([]);
  const [gearTagFilter, setGearTagFilter] = useState<ItemTag | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerStartingHp = clampNumber(playerStartingHpInput, 20, 1, 999);
  const playerGold = clampNumber(playerGoldInput, 0, 0, 999);
  const playerCurrentHp = clampNumber(playerHpInput, 20, 0, 999);
  const enemyStartingHp = clampNumber(enemyStartingHpInput, 20, 1, 999);
  const enemyCurrentHp = clampNumber(enemyHpInput, 20, 0, 999);
  const enemyGold = clampNumber(enemyGoldInput, 0, 0, 999);

  const playerToolInstance = useMemo(() => buildToolInstance(playerTool), [playerTool]);
  const enemyToolInstance = useMemo(() => buildToolInstance(enemyTool), [enemyTool]);
  const playerGearInstances = useMemo(() => playerGear.map(buildGearInstance), [playerGear]);
  const enemyGearInstances = useMemo(() => enemyGear.map(buildGearInstance), [enemyGear]);

  const playerActiveItemsets = useMemo<ItemsetId[]>(
    () => getActiveItemsets(playerToolInstance?.id ?? null, playerGearInstances.map((item) => item.id)),
    [playerToolInstance, playerGearInstances]
  );
  const enemyActiveItemsets = useMemo<ItemsetId[]>(
    () => getActiveItemsets(enemyToolInstance?.id ?? null, enemyGearInstances.map((item) => item.id)),
    [enemyToolInstance, enemyGearInstances]
  );

  // Auto-update Starting HP and Current HP when item flat HP changes
  const playerItemHpBonus = useMemo(
    () => getCombinedStats(playerToolInstance, playerGearInstances).hp ?? 0,
    [playerToolInstance, playerGearInstances]
  );
  const prevPlayerItemHpBonusRef = useRef(playerItemHpBonus);
  useEffect(() => {
    const prev = prevPlayerItemHpBonusRef.current;
    prevPlayerItemHpBonusRef.current = playerItemHpBonus;
    const diff = playerItemHpBonus - prev;
    if (diff === 0) return;
    setPlayerStartingHpInput((v) => String(Math.max(1, (parseInt(v, 10) || 20) + diff)));
    setPlayerHpInput((v) => String(Math.max(0, (parseInt(v, 10) || 20) + diff)));
  }, [playerItemHpBonus]);

  const filteredGearDefs = useMemo(
    () =>
      gearTagFilter
        ? Object.values(GEAR_DEFINITIONS).filter((g) => g.tags.includes(gearTagFilter))
        : Object.values(GEAR_DEFINITIONS),
    [gearTagFilter]
  );

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);
  const controllerHints = useMemo<ButtonHint[]>(
    () => [
      { button: 'B', label: 'Back' },
      { button: 'A', label: 'Simulate' },
    ],
    []
  );

  const handleAddGear = useCallback((target: 'player' | 'enemy', gearId: GearId) => {
    const updater = target === 'player' ? setPlayerGear : setEnemyGear;
    updater((prev) => {
      if (prev.length >= 12) return prev;
      gearKeyRef.current += 1;
      return [...prev, { key: `${gearId}_${gearKeyRef.current}`, id: gearId, tier: 1 }];
    });
    setSelector(null);
  }, []);

  const handleChangeTool = useCallback((target: 'player' | 'enemy', toolId: ToolId) => {
    const selection = { id: toolId, tier: 1 as ItemTier, oil: null };
    if (target === 'player') {
      setPlayerTool(selection);
    } else {
      setEnemyTool(selection);
    }
    setSelector(null);
  }, []);

  const simulateCombat = useCallback(() => {
    setError(null);

    if (playerGear.length > 12) {
      setError('Player loadout exceeds 12 gear items.');
      return;
    }

    if (enemyMode === 'mole' && enemyGear.length > 12) {
      setError('Enemy loadout exceeds 12 gear items.');
      return;
    }

    const playerCombatant = buildPlayerCombatant(
      playerStartingHp,
      playerCurrentHp,
      playerToolInstance,
      playerGearInstances
    );

    let combatParams: CombatParams;
    if (enemyMode === 'field') {
      const enemyDef = ENEMY_DEFINITIONS[fieldEnemyId];
      const tierStats = enemyDef.tiers[fieldEnemyTier - 1];
      combatParams = {
        player: playerCombatant,
        enemy: buildEnemyCombatant(enemyDef.name, enemyDef.emoji, fieldEnemyId, tierStats),
        seed: 1337,
        enemyId: fieldEnemyId,
        enemyDefinitionId: fieldEnemyId,
        enemyTier: fieldEnemyTier,
        goldReward: calculateGoldReward(fieldEnemyId, fieldEnemyTier),
        activeItemSets: playerActiveItemsets,
        playerGear: playerGearInstances,
        playerTool: playerToolInstance,
        playerGold,
        enemyActiveItemSets: [],
        week: 1,
        isBossFight: false,
        simulatorMode: true,
      };
    } else if (enemyMode === 'boss') {
      const boss = BOSSES[bossId];
      combatParams = {
        player: playerCombatant,
        enemy: buildEnemyCombatant(boss.name, boss.emoji, bossId, boss.stats),
        seed: 1337,
        bossId,
        enemyDefinitionId: bossId,
        goldReward: 0,
        activeItemSets: playerActiveItemsets,
        playerGear: playerGearInstances,
        playerTool: playerToolInstance,
        playerGold,
        enemyActiveItemSets: [],
        week: parseBossWeek(bossId),
        isBossFight: true,
        simulatorMode: true,
      };
    } else {
      combatParams = {
        player: playerCombatant,
        enemy: buildMoleCombatant(
          'Opponent',
          enemyStartingHp,
          enemyCurrentHp,
          enemyToolInstance,
          enemyGearInstances
        ),
        seed: 1337,
        enemyDefinitionId: 'pvpOpponent',
        goldReward: 0,
        activeItemSets: playerActiveItemsets,
        playerGear: playerGearInstances,
        playerTool: playerToolInstance,
        playerGold,
        enemyGold,
        enemyActiveItemSets: enemyActiveItemsets,
        enemyTool: enemyToolInstance,
        enemyGear: enemyGearInstances,
        week: 1,
        isBossFight: false,
        simulatorMode: true,
      };
    }

    navigation.navigate('Combat', { combatInput: combatParams });
  }, [
    bossId,
    enemyGear.length,
    enemyGearInstances,
    enemyGold,
    enemyCurrentHp,
    enemyMode,
    enemyStartingHp,
    enemyToolInstance,
    fieldEnemyId,
    fieldEnemyTier,
    navigation,
    playerActiveItemsets,
    playerGear.length,
    playerGearInstances,
    playerGold,
    playerCurrentHp,
    playerStartingHp,
    playerToolInstance,
  ]);

  useControllerAction(
    {
      onA: simulateCombat,
      onB: handleBack,
    },
    isController
  );

  return (
    <View style={styles.container}>
      <CachedImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <ScrollView contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact]}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              {isCompact ? <View style={styles.backButtonSpacer} /> : (
                <TouchableOpacity onPress={handleBack} activeOpacity={0.85}>
                  <CachedImageBackground
                    source={BACK_BUTTON_IMAGE}
                    style={styles.backButton}
                    resizeMode="stretch"
                  >
                    <Text style={styles.backButtonText}>Back</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
              )}
              <View style={[styles.headerBadge, { paddingHorizontal: 12 * s, paddingVertical: 6 * s }]}>
                <Text style={[styles.headerBadgeText, { fontSize: 12 * s }]}>Local Only</Text>
              </View>
            </View>
            <Text style={[styles.title, { fontSize: 34 * s }]}>Battle Simulator</Text>
            <Text style={[styles.subtitle, { fontSize: 14 * s, lineHeight: 20 * s }]}>
              Local-only tool. Mole opponent loadouts now carry symmetric tool, gear, and itemset
              data into the combat entrypoint for parity work.
            </Text>
          </View>

          <Panel title="Player Setup" s={s}>
            <View style={[styles.compactInputRow, { gap: 12 * s }]}>
              <CompactInput
                label="Starting HP"
                value={playerStartingHpInput}
                onChangeText={(value) => setPlayerStartingHpInput(value.replace(/[^0-9]/g, ''))}
                s={s}
              />
              <CompactInput
                label="Current HP"
                value={playerHpInput}
                onChangeText={(value) => setPlayerHpInput(value.replace(/[^0-9]/g, ''))}
                s={s}
              />
              <CompactInput
                label="Gold"
                value={playerGoldInput}
                onChangeText={(value) => setPlayerGoldInput(value.replace(/[^0-9]/g, ''))}
                s={s}
              />
            </View>

            <LoadoutEditor
              label="Tool"
              tool={playerTool}
              gear={playerGear}
              onPickTool={() => setSelector({ kind: 'playerTool' })}
              onClearTool={() => setPlayerTool(null)}
              onToolTierChange={(tier) => setPlayerTool((prev) => (prev ? { ...prev, tier } : prev))}
              onToolOilChange={(oil) => setPlayerTool((prev) => (prev ? { ...prev, oil } : prev))}
              onAddGear={() => setSelector({ kind: 'playerGear' })}
              onGearTierChange={(key, tier) =>
                setPlayerGear((prev) => prev.map((item) => (item.key === key ? { ...item, tier } : item)))
              }
              onRemoveGear={(key) => setPlayerGear((prev) => prev.filter((item) => item.key !== key))}
              s={s}
            />

            <Text style={[styles.metaText, { fontSize: 13 * s }]}>
              Active itemsets: {playerActiveItemsets.length > 0 ? playerActiveItemsets.join(', ') : 'None'}
            </Text>
          </Panel>

          <Panel title="Enemy Setup" s={s}>
            <ChipRow
              label="Enemy Type"
              options={[
                { label: 'Field', active: enemyMode === 'field', onPress: () => setEnemyMode('field') },
                { label: 'Boss', active: enemyMode === 'boss', onPress: () => setEnemyMode('boss') },
                { label: 'Mole', active: enemyMode === 'mole', onPress: () => setEnemyMode('mole') },
              ]}
              s={s}
            />

            {enemyMode === 'field' && (
              <>
                <SelectionRow
                  label="Field Enemy"
                  value={ENEMY_DEFINITIONS[fieldEnemyId].name}
                  image={ENEMY_IMAGES[fieldEnemyId]}
                  onPress={() => setSelector({ kind: 'fieldEnemy' })}
                  s={s}
                />
                <ChipRow
                  label="Tier"
                  options={[
                    { label: 'I', active: fieldEnemyTier === 1, onPress: () => setFieldEnemyTier(1) },
                    { label: 'II', active: fieldEnemyTier === 2, onPress: () => setFieldEnemyTier(2) },
                    { label: 'III', active: fieldEnemyTier === 3, onPress: () => setFieldEnemyTier(3) },
                  ]}
                  s={s}
                />
              </>
            )}

            {enemyMode === 'boss' && (
              <SelectionRow
                label="Boss"
                value={BOSSES[bossId].name}
                image={BOSS_IMAGES[bossId]}
                onPress={() => setSelector({ kind: 'boss' })}
                s={s}
              />
            )}

            {enemyMode === 'mole' && (
              <>
                <View style={[styles.compactInputRow, { gap: 12 * s }]}>
                  <CompactInput
                    label="Starting HP"
                    value={enemyStartingHpInput}
                    onChangeText={(value) => setEnemyStartingHpInput(value.replace(/[^0-9]/g, ''))}
                    s={s}
                  />
                  <CompactInput
                    label="Current HP"
                    value={enemyHpInput}
                    onChangeText={(value) => setEnemyHpInput(value.replace(/[^0-9]/g, ''))}
                    s={s}
                  />
                  <CompactInput
                    label="Gold"
                    value={enemyGoldInput}
                    onChangeText={(value) => setEnemyGoldInput(value.replace(/[^0-9]/g, ''))}
                    s={s}
                  />
                </View>
                <LoadoutEditor
                  label="Tool"
                  tool={enemyTool}
                  gear={enemyGear}
                  onPickTool={() => setSelector({ kind: 'enemyTool' })}
                  onClearTool={() => setEnemyTool(null)}
                  onToolTierChange={(tier) => setEnemyTool((prev) => (prev ? { ...prev, tier } : prev))}
                  onToolOilChange={(oil) => setEnemyTool((prev) => (prev ? { ...prev, oil } : prev))}
                  onAddGear={() => setSelector({ kind: 'enemyGear' })}
                  onGearTierChange={(key, tier) =>
                    setEnemyGear((prev) => prev.map((item) => (item.key === key ? { ...item, tier } : item)))
                  }
                  onRemoveGear={(key) => setEnemyGear((prev) => prev.filter((item) => item.key !== key))}
                  s={s}
                />
              </>
            )}
          </Panel>

          {error && <Text style={[styles.errorText, { fontSize: 13 * s }]}>{error}</Text>}
          <View style={[styles.actionRow, { gap: 12 * s }]}>
            <TouchableOpacity onPress={handleBack} activeOpacity={0.85} style={[styles.secondaryButton, { minWidth: 136 * s, minHeight: 52 * s, paddingHorizontal: 18 * s, paddingVertical: 12 * s, borderRadius: 14 * s }]}>
              <Text style={[styles.secondaryButtonText, { fontSize: 16 * s }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={simulateCombat} activeOpacity={0.85} style={[styles.primaryButton, { minWidth: 180 * s, minHeight: 56 * s, paddingHorizontal: 18 * s, paddingVertical: 12 * s, borderRadius: 14 * s }]}>
              <Text style={[styles.primaryButtonText, { fontSize: 18 * s }]}>Simulate</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        {isController && <ControllerHints hints={controllerHints} horizontal />}
      </CachedImageBackground>

      <SelectorModal
        visible={selector !== null}
        title={getSelectorTitle(selector)}
        onClose={() => {
          setSelector(null);
          setGearTagFilter(null);
        }}
      >
        {selector?.kind === 'playerTool' || selector?.kind === 'enemyTool' ? (
          Object.values(TOOL_DEFINITIONS).map((tool) => (
            <SelectorButton
              key={tool.id}
              label={`${tool.name} (${tool.id})`}
              image={tool.image}
              subtitle={formatItemStats(getToolStatsAtTier(tool.id, 1))}
              onPress={() => handleChangeTool(selector.kind === 'playerTool' ? 'player' : 'enemy', tool.id)}
            />
          ))
        ) : null}

        {selector?.kind === 'playerGear' || selector?.kind === 'enemyGear' ? (
          <>
            <View style={styles.gearFilterRow}>
              <TouchableOpacity
                onPress={() => setGearTagFilter(null)}
                style={[styles.chip, !gearTagFilter && styles.chipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, !gearTagFilter && styles.chipTextActive]}>All</Text>
              </TouchableOpacity>
              {GEAR_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() => setGearTagFilter(tag)}
                  style={[styles.chip, gearTagFilter === tag && styles.chipActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, gearTagFilter === tag && styles.chipTextActive]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {filteredGearDefs.map((gear) => (
              <SelectorButton
                key={gear.id}
                label={`${gear.name} (${gear.id})`}
                image={gear.image}
                subtitle={formatItemStats(gear.stats)}
                onPress={() => handleAddGear(selector.kind === 'playerGear' ? 'player' : 'enemy', gear.id)}
              />
            ))}
          </>
        ) : null}

        {selector?.kind === 'fieldEnemy' ? (
          Object.values(ENEMY_DEFINITIONS).map((enemy) => (
            <SelectorButton
              key={enemy.id}
              label={`${enemy.name} (${enemy.id})`}
              image={ENEMY_IMAGES[enemy.id]}
              subtitle={enemy.tiers.map((t, i) => `T${i + 1}: ${formatCombatStats(t)}`).join('  ')}
              onPress={() => {
                setFieldEnemyId(enemy.id);
                setSelector(null);
              }}
            />
          ))
        ) : null}

        {selector?.kind === 'boss' ? (
          Object.entries(BOSSES).map(([id, boss]) => (
            <SelectorButton
              key={id}
              label={`${boss.name} (${id})`}
              image={BOSS_IMAGES[id as BossId]}
              subtitle={formatCombatStats(boss.stats)}
              onPress={() => {
                setBossId(id as BossId);
                setSelector(null);
              }}
            />
          ))
        ) : null}
      </SelectorModal>
    </View>
  );
}

function buildToolInstance(selection: ToolSelection): Tool | null {
  if (!selection) return null;
  const tool = createToolInstance(selection.id);
  const stats = getToolStatsAtTier(selection.id, selection.tier);
  return {
    ...tool,
    rarity: TIER_RARITY[selection.tier],
    stats,
    oil: selection.oil,
  };
}

function buildGearInstance(selection: GearSelection): Gear {
  return createGearInstance(selection.id, TIER_RARITY[selection.tier]);
}

function buildPlayerCombatant(
  startingHp: number,
  currentHp: number,
  tool: Tool | null,
  gear: Gear[]
): CombatantState {
  const bonuses = getCombinedStats(tool, gear);
  const fullHp = startingHp + (bonuses.hp ?? 0);

  return {
    name: 'Player',
    emoji: '🧑‍🔧',
    definitionId: 'player',
    isPlayer: true,
    maxHp: fullHp,
    hp: Math.min(currentHp, fullHp),
    atk: bonuses.atk ?? 0,
    arm: bonuses.arm ?? 0,
    spd: bonuses.spd ?? 0,
    dig: bonuses.dig ?? 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

function buildMoleCombatant(
  name: string,
  startingHp: number,
  currentHp: number,
  tool: Tool | null,
  gear: Gear[]
): CombatantState {
  const bonuses = getCombinedStats(tool, gear);
  const maxHp = startingHp + (bonuses.hp ?? 0);
  return {
    name,
    emoji: '',
    definitionId: 'pvpOpponent',
    isPlayer: false,
    maxHp,
    hp: Math.min(currentHp, maxHp),
    atk: bonuses.atk ?? 0,
    arm: bonuses.arm ?? 0,
    spd: bonuses.spd ?? 0,
    dig: bonuses.dig ?? 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

function buildEnemyCombatant(
  name: string,
  emoji: string,
  definitionId: string,
  stats: { hp: number; atk: number; arm: number; spd: number; dig: number }
): CombatantState {
  return {
    name,
    emoji,
    definitionId,
    isPlayer: false,
    maxHp: stats.hp,
    hp: stats.hp,
    atk: stats.atk,
    arm: stats.arm,
    spd: stats.spd,
    dig: stats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

function getCombinedStats(tool: Tool | null, gear: Gear[]) {
  return calculateCombatBakedItemStats(tool, gear);
}

function formatCombatStats(s: { hp: number; atk: number; arm: number; spd: number; dig: number }) {
  return `${s.hp}/${s.atk}/${s.arm}/${s.spd}/${s.dig}`;
}

function formatItemStats(s: ItemStats) {
  const parts: string[] = [];
  if (s.hp) parts.push(`HP ${s.hp}`);
  if (s.atk) parts.push(`ATK ${s.atk}`);
  if (s.arm) parts.push(`ARM ${s.arm}`);
  if (s.spd) parts.push(`SPD ${s.spd}`);
  if (s.dig) parts.push(`DIG ${s.dig}`);
  return parts.length > 0 ? parts.join(' ') : '—';
}

function parseBossWeek(bossId: BossId): 1 | 2 | 3 {
  if (bossId.includes('-W1-')) return 1;
  if (bossId.includes('-W2-')) return 2;
  return 3;
}

function clampNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getSelectorTitle(selector: SelectorState): string {
  switch (selector?.kind) {
    case 'playerTool':
      return 'Pick Player Tool';
    case 'enemyTool':
      return 'Pick Enemy Tool';
    case 'playerGear':
      return 'Add Player Gear';
    case 'enemyGear':
      return 'Add Enemy Gear';
    case 'fieldEnemy':
      return 'Pick Field Enemy';
    case 'boss':
      return 'Pick Boss';
    default:
      return '';
  }
}

function Panel({ title, children, s = 1 }: { title: string; children: React.ReactNode; s?: number }) {
  return (
    <View style={[styles.panel, { paddingHorizontal: 18 * s, paddingTop: 18 * s, paddingBottom: 16 * s, borderRadius: 20 * s }]}>
      <Text style={[styles.panelTitle, { fontSize: 22 * s, marginBottom: 12 * s }]}>{title}</Text>
      <View style={[styles.panelBody, { gap: 12 * s }]}>{children}</View>
    </View>
  );
}

function SelectionRow({
  label,
  value,
  image,
  onPress,
  s = 1,
}: {
  label: string;
  value: string;
  image?: any;
  onPress: () => void;
  s?: number;
}) {
  return (
    <View style={[styles.row, { gap: 12 * s }]}>
      <Text style={[styles.label, { fontSize: 14 * s }]}>{label}</Text>
      <TouchableOpacity style={[styles.selectorButton, { paddingHorizontal: 12 * s, paddingVertical: 8 * s, borderRadius: 12 * s }]} onPress={onPress} activeOpacity={0.8}>
        <View style={[styles.selectorButtonRow, { gap: 8 * s }]}>
          {image && (
            <CachedImage source={image} style={{ width: 24 * s, height: 24 * s, borderRadius: 4 * s }} contentFit="contain" />
          )}
          <Text style={[styles.selectorButtonText, { fontSize: 14 * s }]}>{value}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
        keyboardType="number-pad"
        placeholderTextColor="#8a7a6a"
      />
    </View>
  );
}

function CompactInput({
  label,
  value,
  onChangeText,
  s = 1,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  s?: number;
}) {
  return (
    <View style={[styles.compactInputCell, { gap: 4 * s }]}>
      <Text style={[styles.compactInputLabel, { fontSize: 12 * s }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[styles.compactInputField, { paddingHorizontal: 10 * s, paddingVertical: 7 * s, borderRadius: 10 * s, fontSize: 14 * s }]}
        keyboardType="number-pad"
        placeholderTextColor="#8a7a6a"
      />
    </View>
  );
}

function ChipRow({
  label,
  options,
  s = 1,
}: {
  label: string;
  options: Array<{ label: string; active: boolean; onPress: () => void }>;
  s?: number;
}) {
  return (
    <View style={[styles.rowTop, { gap: 8 * s }]}>
      <Text style={[styles.label, { fontSize: 14 * s }]}>{label}</Text>
      <View style={[styles.chipWrap, { gap: 8 * s }]}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.label}
            onPress={option.onPress}
            style={[styles.chip, { paddingHorizontal: 10 * s, paddingVertical: 6 * s }, option.active && styles.chipActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, { fontSize: 13 * s }, option.active && styles.chipTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function LoadoutEditor({
  label,
  tool,
  gear,
  onPickTool,
  onClearTool,
  onToolTierChange,
  onToolOilChange,
  onAddGear,
  onGearTierChange,
  onRemoveGear,
  s = 1,
}: {
  label: string;
  tool: ToolSelection;
  gear: GearSelection[];
  onPickTool: () => void;
  onClearTool: () => void;
  onToolTierChange: (tier: ItemTier) => void;
  onToolOilChange: (oil: ToolOil | null) => void;
  onAddGear: () => void;
  onGearTierChange: (key: string, tier: ItemTier) => void;
  onRemoveGear: (key: string) => void;
  s?: number;
}) {
  return (
    <View style={[styles.loadoutBlock, { gap: 10 * s }]}>
      <SelectionRow
        label={label}
        value={tool ? TOOL_DEFINITIONS[tool.id].name : 'None'}
        image={tool ? TOOL_DEFINITIONS[tool.id].image : undefined}
        onPress={onPickTool}
        s={s}
      />
      {tool ? (
        <>
          <ChipRow
            label="Tool Tier"
            options={[
              { label: 'I', active: tool.tier === 1, onPress: () => onToolTierChange(1) },
              { label: 'II', active: tool.tier === 2, onPress: () => onToolTierChange(2) },
              { label: 'III', active: tool.tier === 3, onPress: () => onToolTierChange(3) },
            ]}
            s={s}
          />
          <ChipRow
            label="Oil"
            options={TOOL_OILS.map((oil) => ({
              label: oil ?? 'None',
              active: tool.oil === oil,
              onPress: () => onToolOilChange(oil),
            }))}
            s={s}
          />
          <TouchableOpacity onPress={onClearTool} activeOpacity={0.8} style={styles.clearLink}>
            <Text style={[styles.clearLinkText, { fontSize: 13 * s }]}>Clear tool</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <View style={[styles.rowTop, { gap: 8 * s }]}>
        <Text style={[styles.label, { fontSize: 14 * s }]}>Gear ({gear.length}/12)</Text>
        <TouchableOpacity style={[styles.selectorButton, { paddingHorizontal: 12 * s, paddingVertical: 8 * s, borderRadius: 12 * s }]} onPress={onAddGear} activeOpacity={0.8}>
          <Text style={[styles.selectorButtonText, { fontSize: 14 * s }]}>Add Gear</Text>
        </TouchableOpacity>
      </View>

      {gear.length === 0 ? (
        <Text style={[styles.metaText, { fontSize: 13 * s }]}>No gear selected.</Text>
      ) : (
        gear.map((item) => (
          <View key={item.key} style={[styles.gearRow, { gap: 6 * s, paddingVertical: 6 * s }]}>
            <View style={[styles.gearNameRow, { gap: 8 * s }]}>
              {GEAR_DEFINITIONS[item.id].image && (
                <CachedImage
                  source={GEAR_DEFINITIONS[item.id].image}
                  style={{ width: 24 * s, height: 24 * s, borderRadius: 4 * s }}
                  contentFit="contain"
                />
              )}
              <Text style={[styles.gearName, { fontSize: 14 * s }]}>{GEAR_DEFINITIONS[item.id].name}</Text>
            </View>
            <View style={[styles.gearControls, { gap: 8 * s }]}>
              {[1, 2, 3].map((tier) => (
                <TouchableOpacity
                  key={tier}
                  onPress={() => onGearTierChange(item.key, tier as ItemTier)}
                  style={[styles.tierChip, { paddingHorizontal: 8 * s, paddingVertical: 4 * s }, item.tier === tier && styles.chipActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tierChipText, { fontSize: 12 * s }, item.tier === tier && styles.chipTextActive]}>
                    {TIER_LABELS[tier as ItemTier]}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => onRemoveGear(item.key)} activeOpacity={0.8}>
                <Text style={[styles.removeText, { fontSize: 12 * s }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function SelectorModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <InlineModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => undefined}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{title}</Text>
              <ScrollView style={styles.modalScroll}>{children}</ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </InlineModal>
  );
}

function SelectorButton({
  label,
  image,
  subtitle,
  onPress,
}: {
  label: string;
  image?: any;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.modalOption}>
      <View style={styles.modalOptionRow}>
        {image && (
          <CachedImage source={image} style={styles.modalOptionIcon} contentFit="contain" />
        )}
        <Text style={styles.modalOptionText}>{label}</Text>
        {subtitle ? <Text style={styles.modalOptionStats}>{subtitle}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 18,
  },
  scrollContentCompact: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 36,
    gap: 27,
  },
  header: {
    gap: 10,
    paddingTop: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(79, 112, 83, 0.92)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBadgeText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#f4f3ea',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 34,
    color: '#1f150f',
    textAlign: 'left',
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: '#231710',
    textAlign: 'left',
  },
  panel: {
    backgroundColor: 'rgba(23, 22, 19, 0.84)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(209, 177, 125, 0.22)',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  panelTitle: {
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#f3dfb5',
    marginBottom: 12,
  },
  panelBody: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTop: {
    gap: 8,
  },
  label: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#dfd2bf',
  },
  input: {
    minWidth: 80,
    borderWidth: 1,
    borderColor: 'rgba(214, 189, 148, 0.32)',
    backgroundColor: 'rgba(244, 237, 222, 0.08)',
    color: '#f6ead8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: Typography.body,
    fontSize: 14,
    textAlign: 'right',
  },
  selectorButton: {
    borderWidth: 1,
    borderColor: 'rgba(214, 189, 148, 0.28)',
    backgroundColor: 'rgba(244, 237, 222, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  selectorButtonText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#f5e4c4',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(214, 189, 148, 0.24)',
    backgroundColor: 'rgba(244, 237, 222, 0.06)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: '#b9713d',
    borderColor: '#d9a15a',
  },
  chipText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#d9cbba',
  },
  chipTextActive: {
    color: '#fff7eb',
  },
  loadoutBlock: {
    gap: 10,
  },
  clearLink: {
    alignSelf: 'flex-start',
  },
  clearLinkText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#e09076',
  },
  gearRow: {
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  gearName: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#f4ead2',
  },
  gearControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tierChip: {
    borderWidth: 1,
    borderColor: 'rgba(214, 189, 148, 0.24)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(244, 237, 222, 0.06)',
  },
  tierChipText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#d9cbba',
  },
  removeText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#e09076',
  },
  metaText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#b8a993',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  backButton: {
    width: 132,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonSpacer: {
    width: 132,
    height: 52,
  },
  backButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#24170f',
  },
  secondaryButton: {
    minWidth: 136,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(214, 189, 148, 0.28)',
    backgroundColor: 'rgba(244, 237, 222, 0.08)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    flex: 1,
  },
  secondaryButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#f5e4c4',
  },
  primaryButton: {
    minWidth: 180,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#d58a44',
    borderWidth: 1,
    borderColor: '#f2ba7a',
    paddingHorizontal: 18,
    paddingVertical: 12,
    flex: 1.2,
  },
  primaryButtonText: {
    fontFamily: Typography.button,
    fontSize: 18,
    color: '#25160c',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#ff9d8c',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,5,5,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '80%',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    backgroundColor: '#171613',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(214, 189, 148, 0.24)',
  },
  modalTitle: {
    fontFamily: Typography.header,
    fontSize: 24,
    color: '#f3dfb5',
    marginBottom: 12,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalOption: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  modalOptionText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#f5e4c4',
    flexShrink: 1,
  },
  modalOptionStats: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#a89b84',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  selectorButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  gearNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  compactInputCell: {
    flex: 1,
    gap: 4,
  },
  compactInputLabel: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#b8a993',
  },
  compactInputField: {
    borderWidth: 1,
    borderColor: 'rgba(214, 189, 148, 0.32)',
    backgroundColor: 'rgba(244, 237, 222, 0.08)',
    color: '#f6ead8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontFamily: Typography.body,
    fontSize: 14,
    textAlign: 'center',
  },
  gearFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
});
