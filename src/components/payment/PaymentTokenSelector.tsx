/**
 * Horizontal row of token pills for payment token selection.
 * PSG1 navigable: D-pad Left/Right cycles tokens, A confirms.
 * Selected token gets golden border matching parchment theme.
 */
import React, { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Typography } from '@/theme/typography';
import { FocusGlow } from '@/components/ui/FocusGlow';
import type { SupportedToken, SwapQuote } from '@/services/solana/jupiter';

const TOKEN_ICONS: Record<string, ReturnType<typeof require>> = {
  SOL: require('../../../assets/icons/tokens/solana-sol-logo.png'),
  USDC: require('../../../assets/icons/tokens/usd-coin-usdc-logo.png'),
  JUP: require('../../../assets/icons/tokens/jupiter-ag-jup-logo.png'),
  BONK: require('../../../assets/icons/tokens/bonk-bonk-logo.png'),
};

function TokenIcon({ symbol, size }: { symbol: string; size: number }) {
  const source = TOKEN_ICONS[symbol];
  if (!source) return null;
  return <Image source={source} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

interface PaymentTokenSelectorProps {
  tokens: SupportedToken[];
  selectedToken: SupportedToken;
  onSelectToken: (token: SupportedToken) => void;
  quote: SwapQuote | null;
  isQuoteLoading?: boolean;
  solUsdPrice: number | null;
  requiredLamports: bigint;
  isCompact?: boolean;
  isController?: boolean;
  focusedIndex?: number;
  vertical?: boolean;
}

export function PaymentTokenSelector({
  tokens,
  selectedToken,
  onSelectToken,
  quote,
  isQuoteLoading = false,
  solUsdPrice,
  requiredLamports,
  isCompact = false,
  isController = false,
  focusedIndex,
  vertical = false,
}: PaymentTokenSelectorProps) {
  const iconSize = isCompact ? 36 : 22;

  const priceLabel = useMemo(() => {
    const solAmount = Number(requiredLamports) / 1e9;

    if (selectedToken.isNative) {
      if (solUsdPrice) {
        return `${solAmount} SOL (~$${(solAmount * solUsdPrice).toFixed(2)})`;
      }
      return `${solAmount} SOL`;
    }

    if (isQuoteLoading) {
      return 'Loading price...';
    }

    if (quote) {
      const formatted =
        quote.inputAmount < 1
          ? quote.inputAmount.toFixed(4)
          : quote.inputAmount < 1000
            ? quote.inputAmount.toFixed(2)
            : Math.ceil(quote.inputAmount).toLocaleString();
      return `~${formatted} ${selectedToken.symbol} (~$${quote.inputUsdValue.toFixed(2)})`;
    }

    return 'Price unavailable';
  }, [selectedToken, quote, isQuoteLoading, solUsdPrice, requiredLamports]);

  return (
    <View style={[styles.container, vertical && styles.containerVertical]}>
      <Text style={[styles.label, isCompact && compactStyles.label]}>Pay with (Powered by Jupiter):</Text>
      <View style={[styles.pillRow, vertical && styles.pillColumn]}>
        {tokens.map((token, idx) => {
          const isSelected = token.symbol === selectedToken.symbol;
          const isFocused = isController && focusedIndex === idx;

          const pill = (
            <TouchableOpacity
              key={token.symbol}
              style={[
                styles.pill,
                isCompact && compactStyles.pill,
                isSelected && styles.pillSelected,
              ]}
              onPress={() => onSelectToken(token)}
              activeOpacity={0.7}
            >
              <TokenIcon symbol={token.symbol} size={iconSize} />
              <Text
                style={[
                  styles.pillText,
                  isCompact && compactStyles.pillText,
                  isSelected && styles.pillTextSelected,
                ]}
              >
                {token.symbol}
              </Text>
            </TouchableOpacity>
          );

          return isFocused ? (
            <FocusGlow key={token.symbol} active>
              {pill}
            </FocusGlow>
          ) : (
            pill
          );
        })}
      </View>
      <Text style={[styles.priceLabel, isCompact && compactStyles.priceLabel]}>{priceLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
  },
  containerVertical: {
    alignItems: 'flex-start',
  },
  label: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#8a7a6a',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pillColumn: {
    flexDirection: 'column',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 68,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(92, 64, 51, 0.2)',
    backgroundColor: 'rgba(239, 233, 214, 0.6)',
  },
  pillSelected: {
    borderColor: '#D4A017',
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
  },
  pillText: {
    fontFamily: Typography.stat,
    fontSize: 11,
    color: '#3d2b1f',
  },
  pillTextSelected: {
    fontWeight: 'bold',
  },
  priceLabel: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#3d2b1f',
    fontWeight: 'bold',
    marginTop: 2,
  },
});

const compactStyles = StyleSheet.create({
  label: {
    fontSize: 18,
  },
  pill: {
    minWidth: 140,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    gap: 8,
    borderWidth: 2,
  },
  pillText: {
    fontSize: 20,
  },
  priceLabel: {
    fontSize: 22,
    marginTop: 4,
  },
});
