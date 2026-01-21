/**
 * BossTooltipModal - Displays detailed boss information
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  ImageBackground,
  ScrollView,
} from 'react-native';
import { Typography } from '../../theme/typography';
import { getEntityImageSource } from './entityImages';
import type { BossDefinition } from '../../data/bosses';

const SIDEBAR_BG = require('../../../assets/map/sidebar.png');

interface BossTooltipModalProps {
  visible: boolean;
  boss: BossDefinition;
  onClose: () => void;
}

export function BossTooltipModal({ visible, boss, onClose }: BossTooltipModalProps) {
  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={styles.modalContentWrapper}>
          <ImageBackground source={SIDEBAR_BG} style={styles.modalContent} resizeMode="stretch">
            <View style={styles.innerContent}>
              {/* Header */}
              <View style={styles.header}>
                <Image
                  source={getEntityImageSource(boss.id)}
                  style={styles.bossImage}
                  resizeMode="contain"
                />
                <Text style={styles.bossName}>{boss.name}</Text>
              </View>

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <StatBox label="HP" value={boss.stats.hp} color="#000000" />
                <StatBox label="ATK" value={boss.stats.atk} color="#000000" />
                <StatBox label="ARM" value={boss.stats.arm} color="#000000" />
                <StatBox label="SPD" value={boss.stats.spd} color="#000000" />
              </View>

              {/* Abilities */}
              <View style={styles.abilitiesContainer}>
                <ScrollView style={styles.abilitiesScroll}>
                  {boss.abilities.map((ability, index) => (
                    <View key={index} style={styles.abilityItem}>
                      <Text style={styles.abilityName}>{ability.name}</Text>
                      <Text style={styles.abilityDescription}>{ability.description}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <Text style={styles.closeHint}>Tap anywhere to close</Text>
            </View>
          </ImageBackground>
        </View>
      </Pressable>
    </Modal>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statBox, { borderColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContentWrapper: {
    width: 320,
    overflow: 'hidden',
  },
  modalContent: {
    flex: 1,
    width: '100%',
    height: '100%',
    padding: 24,
  },
  innerContent: {
    gap: 16,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  bossImage: {
    width: 48,
    height: 48,
  },
  bossName: {
    fontFamily: Typography.header,
    fontSize: 24,
    color: '#000000',
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statBox: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  statValue: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    fontFamily: Typography.stat,
    fontSize: 10,
    color: '#4A4A4A',
    marginTop: 2,
  },
  abilitiesContainer: {
    flex: 1, // Allow scrolling area to take remaining space
    minHeight: 100, // Ensure some minimum height for abilities
  },
  abilitiesScroll: {
    flexGrow: 0,
  },
  abilityItem: {
    marginBottom: 12,
    gap: 4,
  },
  abilityName: {
    fontFamily: Typography.header,
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
  },
  abilityDescription: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#333333',
    lineHeight: 20,
  },
  closeHint: {
    textAlign: 'center',
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#666666',
    marginTop: 8,
  },
});
