/**
 * BurnerBalanceIndicator Component
 *
 * Displays the current burner wallet SOL balance with low balance warning.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// ============================================================================
// Types
// ============================================================================

interface BurnerBalanceIndicatorProps {
  /** Balance in lamports */
  balance: number;
  /** Whether balance is below low threshold */
  isLowBalance: boolean;
  /** Optional custom styles */
  style?: object;
  /** Whether to show the full balance or compact version */
  compact?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function BurnerBalanceIndicator({
  balance,
  isLowBalance,
  style,
  compact = false,
}: BurnerBalanceIndicatorProps): React.JSX.Element {
  const solBalance = balance / LAMPORTS_PER_SOL;
  const formattedBalance = solBalance.toFixed(compact ? 3 : 6);
  const textColor = isLowBalance ? '#f59e0b' : '#22c55e';

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.icon}>SOL</Text>
      <Text style={[styles.balance, { color: textColor }]}>{formattedBalance}</Text>
      {isLowBalance && <Text style={styles.warning}>Low</Text>}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
  },
  icon: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9945ff', // Solana purple
    backgroundColor: 'rgba(153, 69, 255, 0.2)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  balance: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  warning: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
});

export default BurnerBalanceIndicator;
