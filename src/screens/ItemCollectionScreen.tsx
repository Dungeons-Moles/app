/**
 * ItemCollectionScreen - View all items with unlock progress
 * T076: Create ItemCollectionScreen in src/screens/ItemCollectionScreen.tsx (collection view)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  Animated,
  Modal,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { ItemGrid } from '../components/items/ItemGrid';
import { useItemCollection, TOTAL_ITEMS } from '../hooks/useItemCollection';
import { Typography } from '../theme/typography';
import type { ItemTag } from '../game/engine/types';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');

type ItemCollectionScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ItemCollection'>;
};

export function ItemCollectionScreen({ navigation }: ItemCollectionScreenProps) {
  const { items, progress, tagProgress, getItem } = useItemCollection();
  const [selectedFilter, setSelectedFilter] = useState<ItemTag | 'ALL'>('ALL');
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleItemPress = useCallback((item: { id: number }) => {
    setSelectedItem(item.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedItem(null);
  }, []);

  // Filter items by tag
  const filteredItems = selectedFilter === 'ALL'
    ? items
    : items.filter((item) => item.tag === selectedFilter);

  // Convert to GridItem format
  const gridItems = filteredItems.map((item) => ({
    id: item.index,
    name: item.name,
    emoji: item.emoji,
    tag: item.tag,
    stats: item.stats,
  }));

  // Create set of unlocked IDs
  const unlockedIds = new Set(items.filter((item) => item.isUnlocked).map((item) => item.index));

  // Get selected item details
  const selectedItemData = selectedItem !== null ? getItem(selectedItem) : null;

  const tags: (ItemTag | 'ALL')[] = ['ALL', 'STONE', 'SCOUT', 'GREED', 'BLAST', 'FROST', 'RUST', 'BLOOD', 'TEMPO'];

  return (
    <View style={styles.container}>
      <ImageBackground
        source={BACKGROUND_IMAGE}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.darkOverlay}>
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable style={styles.backButton} onPress={handleBack}>
                <Text style={styles.backButtonText}>← Back</Text>
              </Pressable>
              <Text style={styles.title}>Item Collection</Text>
              <View style={styles.headerSpacer} />
            </View>

            {/* Progress summary */}
            <View style={styles.progressContainer}>
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>
                  {progress.unlockedCount}/{progress.totalCount} Items
                </Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress.percentage}%` }]} />
                </View>
                <Text style={styles.progressPercent}>{progress.percentage}%</Text>
              </View>
              {progress.isComplete && (
                <Text style={styles.completeText}>Collection Complete!</Text>
              )}
            </View>

            {/* Tag filter */}
            <View style={styles.filterContainer}>
              {tags.map((tag) => {
                const tagData = tag === 'ALL' ? null : tagProgress.find((t) => t.tag === tag);
                const isActive = selectedFilter === tag;

                return (
                  <Pressable
                    key={tag}
                    style={[styles.filterButton, isActive && styles.filterButtonActive]}
                    onPress={() => setSelectedFilter(tag)}
                  >
                    <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                      {tag === 'ALL' ? 'All' : tag}
                    </Text>
                    {tagData && (
                      <Text style={[styles.filterCount, isActive && styles.filterCountActive]}>
                        {tagData.unlockedCount}/{tagData.totalCount}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Item grid */}
            <View style={styles.gridContainer}>
              <ItemGrid
                items={gridItems}
                unlockedIds={unlockedIds}
                onItemPress={handleItemPress}
                cardSize="medium"
                columns={8}
                showProgress={false}
              />
            </View>

            {/* Item detail modal */}
            <Modal
              visible={selectedItem !== null}
              transparent
              animationType="fade"
              onRequestClose={handleCloseDetail}
            >
              <Pressable style={styles.modalOverlay} onPress={handleCloseDetail}>
                <View style={styles.modalContent}>
                  {selectedItemData && (
                    <>
                      <View style={styles.modalIcon}>
                        <Text style={styles.modalEmoji}>
                          {selectedItemData.isUnlocked ? selectedItemData.emoji : '🔒'}
                        </Text>
                      </View>
                      <Text style={styles.modalName}>
                        {selectedItemData.isUnlocked ? selectedItemData.name : '???'}
                      </Text>
                      {selectedItemData.isUnlocked && (
                        <>
                          <View style={styles.modalTagBadge}>
                            <Text style={styles.modalTagText}>{selectedItemData.tag}</Text>
                          </View>
                          <View style={styles.modalStats}>
                            {selectedItemData.stats.atk !== undefined && selectedItemData.stats.atk !== 0 && (
                              <Text style={styles.modalStat}>
                                ATK {selectedItemData.stats.atk > 0 ? '+' : ''}{selectedItemData.stats.atk}
                              </Text>
                            )}
                            {selectedItemData.stats.arm !== undefined && selectedItemData.stats.arm !== 0 && (
                              <Text style={styles.modalStat}>
                                ARM {selectedItemData.stats.arm > 0 ? '+' : ''}{selectedItemData.stats.arm}
                              </Text>
                            )}
                            {selectedItemData.stats.spd !== undefined && selectedItemData.stats.spd !== 0 && (
                              <Text style={styles.modalStat}>
                                SPD {selectedItemData.stats.spd > 0 ? '+' : ''}{selectedItemData.stats.spd}
                              </Text>
                            )}
                            {selectedItemData.stats.dig !== undefined && selectedItemData.stats.dig !== 0 && (
                              <Text style={styles.modalStat}>
                                DIG {selectedItemData.stats.dig > 0 ? '+' : ''}{selectedItemData.stats.dig}
                              </Text>
                            )}
                            {selectedItemData.stats.hp !== undefined && selectedItemData.stats.hp !== 0 && (
                              <Text style={styles.modalStat}>
                                HP {selectedItemData.stats.hp > 0 ? '+' : ''}{selectedItemData.stats.hp}
                              </Text>
                            )}
                          </View>
                        </>
                      )}
                      {!selectedItemData.isUnlocked && (
                        <Text style={styles.modalLocked}>
                          Complete levels to unlock this item
                        </Text>
                      )}
                    </>
                  )}
                  <Pressable style={styles.modalCloseButton} onPress={handleCloseDetail}>
                    <Text style={styles.modalCloseText}>Close</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Modal>
          </Animated.View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 12,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#88AACC',
  },
  title: {
    flex: 1,
    fontFamily: Typography.header,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 60,
  },
  progressContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressText: {
    fontFamily: Typography.number,
    fontSize: 14,
    color: '#AAAAAA',
    minWidth: 80,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(80, 90, 100, 0.5)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#44AA44',
    borderRadius: 4,
  },
  progressPercent: {
    fontFamily: Typography.number,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#44AA44',
    minWidth: 45,
    textAlign: 'right',
  },
  completeText: {
    fontFamily: Typography.header,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginTop: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 6,
    marginBottom: 12,
  },
  filterButton: {
    backgroundColor: 'rgba(50, 60, 70, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#445566',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(68, 136, 170, 0.5)',
    borderColor: '#4488AA',
  },
  filterText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#AAAAAA',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  filterCount: {
    fontFamily: Typography.number,
    fontSize: 9,
    color: '#666666',
  },
  filterCountActive: {
    color: '#88CCFF',
  },
  gridContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(40, 50, 60, 0.98)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 260,
    borderWidth: 2,
    borderColor: '#556677',
  },
  modalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(80, 100, 120, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalEmoji: {
    fontSize: 48,
  },
  modalName: {
    fontFamily: Typography.header,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  modalTagBadge: {
    backgroundColor: '#4488AA',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalTagText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  modalStat: {
    fontFamily: Typography.number,
    fontSize: 14,
    color: '#88CCFF',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modalLocked: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalCloseButton: {
    backgroundColor: 'rgba(80, 80, 80, 0.8)',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  modalCloseText: {
    fontFamily: Typography.button,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#CCCCCC',
  },
});
