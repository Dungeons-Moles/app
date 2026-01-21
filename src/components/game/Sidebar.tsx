/**
 * Sidebar Component - Combines BossPanel, StatsPanel, and InventoryPanel
 */

import React, { useState } from 'react';
import { View, StyleSheet, ImageBackground, Text, Image, Pressable } from 'react-native';
import { StatsPanel } from './StatsPanel';
import { InventoryPanel } from './InventoryPanel';
import { BossTooltipModal } from './BossTooltipModal';
import { getBoss } from '../../data/bosses';
import { getEntityImageSource } from './entityImages';
import { Typography } from '../../theme/typography';
import type {
  TimeState,
  PlayerStats,
  Tool,
  InventorySlot,
  ItemsetId,
  Gear,
  GearId,
} from '../../game/engine/types';

const SIDEBAR_BG = require('../../../assets/map/sidebar.png');
const BOSS_PANEL_BG = require('../../../assets/map/boss-panel.png');

interface SidebarProps {
  time: TimeState;
  stats: PlayerStats;
  inventory: InventorySlot[];
  inventoryCapacity: number;
  equippedTool: Tool | null;
  activeItemsets: ItemsetId[];
  onItemPress?: (item: Tool | Gear, slotIndex: number) => void;
  onItemInspect?: (item: Tool | Gear, slotIndex: number) => void;
  onToolInspect?: (tool: Tool) => void;
  isRuneKilnActive?: boolean;
  handleInventoryItemPress?: (item: Tool | Gear, slotIndex: number) => void;
  onlyBoss?: boolean;
  onlyContent?: boolean;
}

export function BossPanel({ time }: { time: TimeState }) {
  const [modalVisible, setModalVisible] = useState(false);
  const boss = getBoss(time.weekBoss);

  return (
    <>
      <View style={styles.bossContainer}>
        <ImageBackground source={BOSS_PANEL_BG} style={styles.bossPanel} resizeMode="stretch">
          <Pressable style={styles.bossContent} onPress={() => setModalVisible(true)}>
            <Image
              source={getEntityImageSource(boss.id)}
              style={styles.bossIcon}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.bossName}>{boss.name}</Text>
              <Text style={styles.bossDetailsText}>Tap for details</Text>
            </View>
          </Pressable>
        </ImageBackground>
      </View>
      <BossTooltipModal visible={modalVisible} boss={boss} onClose={() => setModalVisible(false)} />
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  if (props.onlyBoss) {
    return <BossPanel time={props.time} />;
  }

  const content = (
    <View style={styles.innerContainer}>
      {!props.onlyContent && <BossPanel time={props.time} />}

      <View style={styles.statsWrapper}>
        <StatsPanel stats={props.stats} isSidebar={true} />
      </View>

      <View style={styles.inventoryWrapper}>
        <InventoryPanel
          inventory={props.inventory}
          equippedTool={props.equippedTool}
          inventoryCapacity={props.inventoryCapacity}
          activeItemsets={props.activeItemsets}
          onItemPress={props.isRuneKilnActive ? props.handleInventoryItemPress : undefined}
          onItemInspect={props.onItemInspect}
          onToolInspect={props.onToolInspect}
          isSidebar={true}
        />
      </View>
    </View>
  );

  if (props.onlyContent) {
    return (
      <ImageBackground source={SIDEBAR_BG} style={styles.container} resizeMode="stretch">
        {content}
      </ImageBackground>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground source={SIDEBAR_BG} style={styles.sidebarBg} resizeMode="stretch">
        {content}
      </ImageBackground>
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
    height: '100%',
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
  statsWrapper: {
    flexShrink: 0,
  },
  inventoryWrapper: {
    flex: 1,
  },
});
