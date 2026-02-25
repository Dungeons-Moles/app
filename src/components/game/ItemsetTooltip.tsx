/**
 * ItemsetTooltip Component
 * Displays itemset details: name, icon, required items, and bonus description
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { InlineModal } from '../InlineModal';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import type { ItemsetId } from '../../game/engine/types';
import { getItemsetDefinition } from '../../data/itemsets';
import { Typography } from '../../theme/typography';
import { useAudio } from '@/contexts/AudioContext';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.png');
const squareSource = require('../../../assets/ui/frames/square.png');

const ITEMSET_ICONS: Record<ItemsetId, ReturnType<typeof require>> = {
  UNION_STANDARD: require('../../../assets/icons/itemsets/union_standard.png'),
  SHARD_CIRCUIT: require('../../../assets/icons/itemsets/shard_circuit.png'),
  DEMOLITION_PERMIT: require('../../../assets/icons/itemsets/demolition_permit.png'),
  FUSE_NETWORK: require('../../../assets/icons/itemsets/fuse_network.png'),
  SHRAPNEL_HARNESS: require('../../../assets/icons/itemsets/shrapnel_harness.png'),
  RUST_RITUAL: require('../../../assets/icons/itemsets/rust_ritual.png'),
  SWIFT_DIGGER_KIT: require('../../../assets/icons/itemsets/swift_digger_kit.png'),
  ROYAL_EXTRACTION: require('../../../assets/icons/itemsets/royal_extraction.png'),
  WHITEOUT_INITIATIVE: require('../../../assets/icons/itemsets/whiteout_initiative.png'),
  BLOODRUSH_PROTOCOL: require('../../../assets/icons/itemsets/bloodrush_protocol.png'),
  CORROSION_PAYLOAD: require('../../../assets/icons/itemsets/corrosion_payload.png'),
  GOLDEN_SHRAPNEL_EXCHANGE: require('../../../assets/icons/itemsets/golden_shrapnel_exchange.png'),
};

interface ItemsetTooltipProps {
  itemsetId: ItemsetId | null;
  visible: boolean;
  onClose: () => void;
}

export function ItemsetTooltip({ itemsetId, visible, onClose }: ItemsetTooltipProps) {
  const { playSfx } = useAudio();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const isCompact = useScreenVariant() === 'compact';
  const s = isCompact ? 1.5 : 1;

  const handleClose = () => {
    playSfx('ui_click');
    onClose();
  };

  if (!itemsetId) return null;

  const def = getItemsetDefinition(itemsetId);
  const timingLabel = def.bonus.timing
    ? def.bonus.timing.replace(/_/g, ' ')
    : def.bonus.passive
      ? 'PASSIVE'
      : null;

  return (
    <InlineModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <View
          style={[styles.tooltipContainer, { minWidth: 340 * s, maxWidth: 420 * s }]}
          onLayout={(event) => setLayout(event.nativeEvent.layout)}
        >
          {layout.width > 0 && (
            <Image
              source={paperPanelSource}
              style={{
                position: 'absolute',
                width: layout.height,
                height: layout.width,
                top: (layout.height - layout.width) / 2,
                left: (layout.width - layout.height) / 2,
                transform: [{ rotate: '90deg' }],
              }}
              resizeMode="stretch"
            />
          )}

          <TouchableOpacity
            activeOpacity={1}
            style={[styles.contentContainer, { padding: 48 * s }]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={[styles.iconContainer, { width: 64 * s, height: 64 * s }]}>
                <Image
                  source={squareSource}
                  style={{ position: 'absolute', width: '100%', height: '100%' }}
                  resizeMode="stretch"
                />
                <Image
                  source={ITEMSET_ICONS[itemsetId]}
                  style={{ width: '70%', height: '70%' }}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.name, { fontSize: 18 * s }]}>{def.name}</Text>
                <Text style={[styles.subtitle, { fontSize: 11 * s }]}>
                  {def.requiredItems.length} items required
                </Text>
              </View>
            </View>

            {/* Bonus */}
            {timingLabel && (
              <Text style={[styles.timingLabel, { fontSize: 10 * s }]}>{timingLabel}</Text>
            )}
            <View style={styles.bonusSection}>
              <Text style={[styles.bonusText, { fontSize: 13 * s, lineHeight: 18 * s }]}>
                {def.bonus.description}
              </Text>
            </View>

            {/* Type indicator */}
            <View style={styles.typeIndicator}>
              <Text style={[styles.typeText, { fontSize: 10 * s }]}>Itemset</Text>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </InlineModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  contentContainer: {
    padding: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  iconContainer: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    padding: 8,
    overflow: 'hidden',
  },
  headerText: {
    flex: 1,
  },
  name: {
    color: '#3d2b1f',
    fontSize: 18,
    fontFamily: Typography.header,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#5c4033',
    fontSize: 11,
    fontFamily: Typography.body,
    marginTop: 2,
  },
  bonusSection: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#3d2b1f',
    borderRadius: 4,
  },
  timingLabel: {
    color: '#8B4513',
    fontSize: 10,
    fontFamily: Typography.header,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  bonusText: {
    color: '#3d2b1f',
    fontSize: 13,
    fontFamily: Typography.body,
    lineHeight: 18,
  },
  typeIndicator: {
    position: 'absolute',
    top: 46,
    right: 52,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    color: '#6b7280',
    fontSize: 10,
    fontFamily: Typography.body,
    textTransform: 'uppercase',
  },
});

export default ItemsetTooltip;
