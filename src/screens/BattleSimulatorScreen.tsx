import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  Tool,
  ToolId,
  ToolOil,
} from '@/game/engine/types';
import { getActiveItemsets } from '@/game/entities/itemsets';
import { BOSSES } from '@/data/bosses';
import { ENEMY_DEFINITIONS, calculateGoldReward } from '@/game/entities/enemies';
import type { EnemyId } from '@/game/map/types';
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

export function BattleSimulatorScreen({ navigation }: BattleSimulatorScreenProps) {
  const inputMode = useInputMode();
  const isCompact = useScreenVariant() === 'compact';
  const isController = inputMode === 'controller';
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
  const [seedInput, setSeedInput] = useState('1337');
  const [error, setError] = useState<string | null>(null);

  const playerStartingHp = clampNumber(playerStartingHpInput, 20, 1, 999);
  const playerGold = clampNumber(playerGoldInput, 0, 0, 999);
  const playerCurrentHp = clampNumber(playerHpInput, 20, 0, 999);
  const enemyStartingHp = clampNumber(enemyStartingHpInput, 20, 1, 999);
  const enemyCurrentHp = clampNumber(enemyHpInput, 20, 0, 999);
  const enemyGold = clampNumber(enemyGoldInput, 0, 0, 999);
  const seed = clampNumber(seedInput, 1337, 1, 2_147_483_647);

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
        seed,
        enemyId: fieldEnemyId,
        enemyDefinitionId: fieldEnemyId,
        enemyTier: fieldEnemyTier,
        goldReward: calculateGoldReward(fieldEnemyId, fieldEnemyTier),
        activeItemSets: playerActiveItemsets,
        playerGear: playerGearInstances,
        playerTool: playerToolInstance,
        playerGold,
        enemyActiveItemSets: [],
        useParityResolver: true,
        week: 1,
        isBossFight: false,
        simulatorMode: true,
      };
    } else if (enemyMode === 'boss') {
      const boss = BOSSES[bossId];
      combatParams = {
        player: playerCombatant,
        enemy: buildEnemyCombatant(boss.name, boss.emoji, bossId, boss.stats),
        seed,
        bossId,
        enemyDefinitionId: bossId,
        goldReward: 0,
        activeItemSets: playerActiveItemsets,
        playerGear: playerGearInstances,
        playerTool: playerToolInstance,
        playerGold,
        enemyActiveItemSets: [],
        useParityResolver: true,
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
        seed,
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
        useParityResolver: true,
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
    seed,
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
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>Local Only</Text>
              </View>
            </View>
            <Text style={styles.title}>Battle Simulator</Text>
            <Text style={styles.subtitle}>
              Local-only tool. Mole opponent loadouts now carry symmetric tool, gear, and itemset
              data into the combat entrypoint for parity work.
            </Text>
          </View>

          <Panel title="Player Setup">
            <LabeledInput
              label="Starting HP"
              value={playerStartingHpInput}
              onChangeText={(value) => setPlayerStartingHpInput(value.replace(/[^0-9]/g, ''))}
            />

            <LabeledInput
              label="Current HP"
              value={playerHpInput}
              onChangeText={(value) => setPlayerHpInput(value.replace(/[^0-9]/g, ''))}
            />

            <LabeledInput
              label="Starting Gold"
              value={playerGoldInput}
              onChangeText={(value) => setPlayerGoldInput(value.replace(/[^0-9]/g, ''))}
            />

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
            />

            <Text style={styles.metaText}>
              Active itemsets: {playerActiveItemsets.length > 0 ? playerActiveItemsets.join(', ') : 'None'}
            </Text>
          </Panel>

          <Panel title="Enemy Setup">
            <ChipRow
              label="Enemy Type"
              options={[
                { label: 'Field', active: enemyMode === 'field', onPress: () => setEnemyMode('field') },
                { label: 'Boss', active: enemyMode === 'boss', onPress: () => setEnemyMode('boss') },
                { label: 'Mole', active: enemyMode === 'mole', onPress: () => setEnemyMode('mole') },
              ]}
            />

            {enemyMode === 'field' && (
              <>
                <SelectionRow
                  label="Field Enemy"
                  value={ENEMY_DEFINITIONS[fieldEnemyId].name}
                  onPress={() => setSelector({ kind: 'fieldEnemy' })}
                />
                <ChipRow
                  label="Tier"
                  options={[
                    { label: 'I', active: fieldEnemyTier === 1, onPress: () => setFieldEnemyTier(1) },
                    { label: 'II', active: fieldEnemyTier === 2, onPress: () => setFieldEnemyTier(2) },
                    { label: 'III', active: fieldEnemyTier === 3, onPress: () => setFieldEnemyTier(3) },
                  ]}
                />
              </>
            )}

            {enemyMode === 'boss' && (
              <SelectionRow
                label="Boss"
                value={BOSSES[bossId].name}
                onPress={() => setSelector({ kind: 'boss' })}
              />
            )}

            {enemyMode === 'mole' && (
              <>
                <LabeledInput
                  label="Starting HP"
                  value={enemyStartingHpInput}
                  onChangeText={(value) => setEnemyStartingHpInput(value.replace(/[^0-9]/g, ''))}
                />
                <LabeledInput
                  label="Current HP"
                  value={enemyHpInput}
                  onChangeText={(value) => setEnemyHpInput(value.replace(/[^0-9]/g, ''))}
                />
                <LabeledInput
                  label="Enemy Gold"
                  value={enemyGoldInput}
                  onChangeText={(value) => setEnemyGoldInput(value.replace(/[^0-9]/g, ''))}
                />
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
                />
              </>
            )}
          </Panel>

          <Panel title="Simulation">
            <LabeledInput
              label="Seed"
              value={seedInput}
              onChangeText={(value) => setSeedInput(value.replace(/[^0-9]/g, ''))}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={handleBack} activeOpacity={0.85} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={simulateCombat} activeOpacity={0.85} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Simulate</Text>
              </TouchableOpacity>
            </View>
          </Panel>
        </ScrollView>
        {isController && <ControllerHints hints={controllerHints} horizontal />}
      </CachedImageBackground>

      <SelectorModal
        visible={selector !== null}
        title={getSelectorTitle(selector)}
        onClose={() => setSelector(null)}
      >
        {selector?.kind === 'playerTool' || selector?.kind === 'enemyTool' ? (
          Object.values(TOOL_DEFINITIONS).map((tool) => (
            <SelectorButton
              key={tool.id}
              label={`${tool.name} (${tool.id})`}
              onPress={() => handleChangeTool(selector.kind === 'playerTool' ? 'player' : 'enemy', tool.id)}
            />
          ))
        ) : null}

        {selector?.kind === 'playerGear' || selector?.kind === 'enemyGear' ? (
          Object.values(GEAR_DEFINITIONS).map((gear) => (
            <SelectorButton
              key={gear.id}
              label={`${gear.name} (${gear.id})`}
              onPress={() => handleAddGear(selector.kind === 'playerGear' ? 'player' : 'enemy', gear.id)}
            />
          ))
        ) : null}

        {selector?.kind === 'fieldEnemy' ? (
          Object.values(ENEMY_DEFINITIONS).map((enemy) => (
            <SelectorButton
              key={enemy.id}
              label={`${enemy.name} (${enemy.id})`}
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

function SelectionRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.selectorButton} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.selectorButtonText}>{value}</Text>
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

function ChipRow({
  label,
  options,
}: {
  label: string;
  options: Array<{ label: string; active: boolean; onPress: () => void }>;
}) {
  return (
    <View style={styles.rowTop}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.label}
            onPress={option.onPress}
            style={[styles.chip, option.active && styles.chipActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, option.active && styles.chipTextActive]}>
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
}) {
  return (
    <View style={styles.loadoutBlock}>
      <SelectionRow
        label={label}
        value={tool ? TOOL_DEFINITIONS[tool.id].name : 'None'}
        onPress={onPickTool}
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
          />
          <ChipRow
            label="Oil"
            options={TOOL_OILS.map((oil) => ({
              label: oil ?? 'None',
              active: tool.oil === oil,
              onPress: () => onToolOilChange(oil),
            }))}
          />
          <TouchableOpacity onPress={onClearTool} activeOpacity={0.8} style={styles.clearLink}>
            <Text style={styles.clearLinkText}>Clear tool</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <View style={styles.rowTop}>
        <Text style={styles.label}>Gear ({gear.length}/12)</Text>
        <TouchableOpacity style={styles.selectorButton} onPress={onAddGear} activeOpacity={0.8}>
          <Text style={styles.selectorButtonText}>Add Gear</Text>
        </TouchableOpacity>
      </View>

      {gear.length === 0 ? (
        <Text style={styles.metaText}>No gear selected.</Text>
      ) : (
        gear.map((item) => (
          <View key={item.key} style={styles.gearRow}>
            <Text style={styles.gearName}>{GEAR_DEFINITIONS[item.id].name}</Text>
            <View style={styles.gearControls}>
              {[1, 2, 3].map((tier) => (
                <TouchableOpacity
                  key={tier}
                  onPress={() => onGearTierChange(item.key, tier as ItemTier)}
                  style={[styles.tierChip, item.tier === tier && styles.chipActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tierChipText, item.tier === tier && styles.chipTextActive]}>
                    {TIER_LABELS[tier as ItemTier]}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => onRemoveGear(item.key)} activeOpacity={0.8}>
                <Text style={styles.removeText}>Remove</Text>
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

function SelectorButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.modalOption}>
      <Text style={styles.modalOptionText}>{label}</Text>
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
  modalOptionText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#f5e4c4',
  },
});
