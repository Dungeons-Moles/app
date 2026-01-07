import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { StatsPanel } from '../components/game/StatsPanel';
import { InventoryPanel } from '../components/game/InventoryPanel';
import { ItemTooltip } from '../components/game/ItemTooltip';
import type { Tool, Gear, Player } from '../game/engine/types';
import { createInitialPlayer } from '../game/entities/player';

type GameScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

const SAFE_AREA_EDGES = ['left', 'right'] as const;

// Create initial player for demo purposes
// In full implementation, this would come from game state/context
const initialPlayer = createInitialPlayer({ x: 25, y: 25 });

/**
 * GameScreen - Container for exploration gameplay
 * Displays the dungeon map and D-pad controls in landscape orientation
 * T085: Wires up StatsPanel and InventoryPanel
 */
export function GameScreen({ navigation }: GameScreenProps) {
  // Player state (temporary - will be replaced with game context)
  const [player] = useState<Player>(initialPlayer);

  // Tooltip state
  const [tooltipItem, setTooltipItem] = useState<Tool | Gear | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const handleItemPress = useCallback((item: Tool | Gear, _slotIndex: number) => {
    setTooltipItem(item);
    setTooltipVisible(true);
  }, []);

  const handleToolPress = useCallback((tool: Tool) => {
    setTooltipItem(tool);
    setTooltipVisible(true);
  }, []);

  const handleCloseTooltip = useCallback(() => {
    setTooltipVisible(false);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
      <View style={styles.content}>
        {/* Map Area (center) */}
        <View style={styles.mapArea}>
          <Text style={styles.placeholderText}>Map Renderer</Text>
        </View>

        {/* Right Panel - Stats + Inventory + D-Pad */}
        <View style={styles.rightPanel}>
          {/* Stats Panel */}
          <StatsPanel stats={player.stats} />

          {/* Inventory Panel */}
          <InventoryPanel
            equippedTool={player.equippedTool}
            inventory={player.inventory}
            inventoryCapacity={player.inventoryCapacity}
            activeItemsets={player.activeItemsets}
            onItemPress={handleItemPress}
            onToolPress={handleToolPress}
          />

          {/* D-Pad Controls Placeholder */}
          <View style={styles.controlsArea}>
            <Text style={styles.placeholderText}>D-Pad</Text>
          </View>
        </View>
      </View>

      {/* Item Tooltip Overlay */}
      <ItemTooltip
        item={tooltipItem}
        visible={tooltipVisible}
        onClose={handleCloseTooltip}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  mapArea: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#2a2a30',
  },
  rightPanel: {
    flex: 1,
    backgroundColor: '#151518',
    padding: 8,
    gap: 8,
    justifyContent: 'space-between',
  },
  controlsArea: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  placeholderText: {
    fontSize: 14,
    color: '#555555',
  },
});
