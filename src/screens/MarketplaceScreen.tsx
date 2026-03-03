import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  Animated,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useProfile } from '../contexts/ProfileContext';
import { useWallet } from '../contexts/WalletContext';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { HubSettingsModal } from '../components/ui/HubSettingsModal';
import { useNftMarketplace } from '../hooks/useNftMarketplace';
import { useAudio } from '../contexts/AudioContext';
import { NftCard } from '../components/marketplace/NftCard';
import { PriceInput } from '../components/marketplace/PriceInput';
import { InlineModal } from '../components/InlineModal';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MetaplexCoreAsset, ListingWithAsset } from '../types/solana';
import { findNftItemInfo } from '../data/nftItems';
import { getSkinImage } from '../data/skinImages';
import { RUN_PRICE_LAMPORTS } from '@/services/solana/constants';
import { usePaymentToken } from '@/hooks/usePaymentToken';
import { PaymentTokenSelector, PaymentConfirmationModal } from '@/components/payment';

const backgroundImage = require('../../assets/ui/backgrounds/loading-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV3Source = require('../../assets/ui/buttons/button-v3.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const sessionPapersSource = require('../../assets/ui/illustrations/session-papers.png');
const rectangleSource = require('../../assets/ui/frames/rectangle.png');
const paperPanelSource = require('../../assets/ui/panels/paper-panel.png');
const iconL1Source = require('../../assets/ui/control-buttons/l1.png');
const iconR1Source = require('../../assets/ui/control-buttons/r1.png');

type MarketplaceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Marketplace'>;
};

type Tab = 'skins' | 'items' | 'pve';

export function MarketplaceScreen({ navigation }: MarketplaceScreenProps) {
  const { purchaseRuns, availableRuns, profile } = useProfile();
  const { disconnect } = useWallet();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const [activeTab, setActiveTab] = useState<Tab>('pve');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const payment = usePaymentToken(BigInt(RUN_PRICE_LAMPORTS));
  const [showRunPaymentModal, setShowRunPaymentModal] = useState(false);

  const {
    userSkins,
    userNftItems,
    listings,
    marketplaceConfig,
    isLoading: marketplaceLoading,
    error: marketplaceError,
    fetchUserAssets,
    fetchListings,
    listNft,
    cancelListing,
    buyNft,
    refresh: refreshMarketplace,
  } = useNftMarketplace();
  const { playSfx } = useAudio();

  const [showPriceInput, setShowPriceInput] = useState(false);
  const [selectedNft, setSelectedNft] = useState<{
    asset: MetaplexCoreAsset;
    collection: any;
  } | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (activeTab === 'skins' || activeTab === 'items') {
      refreshMarketplace();
    }
  }, [activeTab]);

  const handleBack = useCallback(() => {
    playSfx('ui_back');
    navigation.goBack();
  }, [navigation, playSfx]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  }, [disconnect, navigation]);

  const handlePurchaseDirect = useCallback(async () => {
    playSfx('ui_click');
    setIsPurchasing(true);
    setPurchaseError(null);
    try {
      const result = await purchaseRuns();
      if (!result?.success) {
        setPurchaseError(result?.error ?? 'Purchase failed');
      }
    } catch (e) {
      setPurchaseError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setIsPurchasing(false);
    }
  }, [purchaseRuns, playSfx]);

  const handlePurchase = useCallback(async () => {
    if (!payment.selectedToken.isNative && payment.quote) {
      setShowRunPaymentModal(true);
      return;
    }
    await handlePurchaseDirect();
  }, [payment.selectedToken, payment.quote, handlePurchaseDirect]);

  const handleRunPaymentConfirm = useCallback(async () => {
    setShowRunPaymentModal(false);
    await handlePurchaseDirect();
  }, [handlePurchaseDirect]);

  const handleListForSale = useCallback(
    (asset: MetaplexCoreAsset, collection: any) => {
      playSfx('ui_click');
      setSelectedNft({ asset, collection });
      setShowPriceInput(true);
    },
    [playSfx]
  );

  const handleConfirmListing = useCallback(
    async (priceSol: number) => {
      playSfx('ui_click');
      if (!selectedNft) return;
      const priceLamports = Math.round(priceSol * LAMPORTS_PER_SOL);
      await listNft(selectedNft.asset.address, selectedNft.collection, priceLamports);
      setShowPriceInput(false);
      setSelectedNft(null);
    },
    [listNft, selectedNft, playSfx]
  );

  const handleCancelListing = useCallback(
    async (listing: ListingWithAsset) => {
      playSfx('ui_click');
      await cancelListing(listing.listing.asset, listing.listing.collection);
    },
    [cancelListing, playSfx]
  );

  const handleBuyNft = useCallback(
    async (listing: ListingWithAsset) => {
      playSfx('ui_click');
      await buyNft(listing);
    },
    [buyNft, playSfx]
  );

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isFocused = useIsFocused();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const TABS: Tab[] = ['skins', 'items', 'pve'];
  const [nftFocus, setNftFocus] = useState(0);
  const [sectionFocus, setSectionFocus] = useState<0 | 1>(0); // 0 = My, 1 = For Sale

  const cycleTab = useCallback(
    (dir: -1 | 1) => {
      playSfx('ui_hover');
      setActiveTab((prev) => {
        const idx = TABS.indexOf(prev);
        const next = idx + dir;
        if (next < 0 || next >= TABS.length) return prev;
        setPurchaseError(null);
        setNftFocus(0);
        setSectionFocus(0);
        return TABS[next];
      });
    },
    [playSfx]
  );

  const cycleToken = useCallback(
    (dir: -1 | 1) => {
      const tokens = payment.supportedTokens;
      const idx = tokens.findIndex((t) => t.symbol === payment.selectedToken.symbol);
      const next = idx + dir;
      if (next >= 0 && next < tokens.length) {
        payment.setSelectedToken(tokens[next]);
      }
    },
    [payment]
  );

  // Sort skins: equipped first, then the rest
  const equippedSkinKey = profile?.equippedSkin?.toBase58() ?? null;
  const sortedSkins =
    activeTab === 'skins'
      ? [...userSkins].sort((a, b) => {
          const aEq = a.address.toBase58() === equippedSkinKey ? 0 : 1;
          const bEq = b.address.toBase58() === equippedSkinKey ? 0 : 1;
          return aEq - bEq;
        })
      : [];

  // Split listings by collection
  const skinsCollectionKey = marketplaceConfig?.skinsCollection?.toBase58() ?? null;
  const itemsCollectionKey = marketplaceConfig?.itemsCollection?.toBase58() ?? null;
  const skinListings = listings.filter(
    (l) => skinsCollectionKey && l.listing.collection.toBase58() === skinsCollectionKey
  );
  const itemListings = listings.filter(
    (l) => itemsCollectionKey && l.listing.collection.toBase58() === itemsCollectionKey
  );

  // Active section items for focus tracking
  const mySkinsCount = sortedSkins.length;
  const forSaleSkinsCount = skinListings.length;
  const myItemsCount = userNftItems.length;
  const forSaleItemsCount = itemListings.length;

  const activeSectionCount =
    activeTab === 'skins'
      ? sectionFocus === 0
        ? mySkinsCount
        : forSaleSkinsCount
      : activeTab === 'items'
        ? sectionFocus === 0
          ? myItemsCount
          : forSaleItemsCount
        : 0;

  const hasSections = activeTab === 'skins' || activeTab === 'items';

  const handleNftAction = useCallback(() => {
    if (activeTab === 'skins') {
      if (sectionFocus === 0) {
        const skin = sortedSkins[nftFocus];
        if (!skin) return;
        const isListed = skinListings.some((l) => l.listing.asset.equals(skin.address));
        const isEquipped = profile?.equippedSkin?.equals(skin.address) ?? false;
        if (!isListed && !isEquipped) handleListForSale(skin, skin.collection);
      } else {
        const listing = skinListings[nftFocus];
        if (!listing) return;
        const isOwnListing = userSkins.some((s) => s.address.equals(listing.listing.asset));
        if (isOwnListing) handleCancelListing(listing);
        else handleBuyNft(listing);
      }
    } else if (activeTab === 'items') {
      if (sectionFocus === 0) {
        const item = userNftItems[nftFocus];
        if (!item) return;
        const isListed = itemListings.some((l) => l.listing.asset.equals(item.address));
        if (!isListed) handleListForSale(item, item.collection);
      } else {
        const listing = itemListings[nftFocus];
        if (!listing) return;
        const isOwnListing = userNftItems.some((i) => i.address.equals(listing.listing.asset));
        if (isOwnListing) handleCancelListing(listing);
        else handleBuyNft(listing);
      }
    }
  }, [
    activeTab,
    sectionFocus,
    nftFocus,
    sortedSkins,
    skinListings,
    itemListings,
    userSkins,
    userNftItems,
    profile,
    handleListForSale,
    handleCancelListing,
    handleBuyNft,
  ]);

  useControllerAction(
    showPriceInput || showRunPaymentModal || showSettingsModal
      ? {} // Modals have their own controller handlers
      : {
          onB: handleBack,
          onStart: () => setShowSettingsModal(true),
          onA:
            activeTab === 'pve' && !isPurchasing
              ? handlePurchase
              : activeSectionCount > 0
                ? handleNftAction
                : undefined,
          onL1: () => cycleTab(-1),
          onR1: () => cycleTab(1),
          onDPadUp: hasSections
            ? () => {
                setSectionFocus((p) => {
                  if (p === 0) return p;
                  setNftFocus(0);
                  return 0;
                });
              }
            : undefined,
          onDPadDown: hasSections
            ? () => {
                setSectionFocus((p) => {
                  if (p === 1) return p;
                  setNftFocus(0);
                  return 1;
                });
              }
            : undefined,
          onDPadLeft:
            activeTab === 'pve'
              ? () => cycleToken(-1)
              : activeSectionCount > 0
                ? () => setNftFocus((p) => Math.max(0, p - 1))
                : undefined,
          onDPadRight:
            activeTab === 'pve'
              ? () => cycleToken(1)
              : activeSectionCount > 0
                ? () => setNftFocus((p) => Math.min(activeSectionCount - 1, p + 1))
                : undefined,
        },
    isController && isFocused
  );

  const controllerHints: ButtonHint[] = [
    { button: 'L1R1', label: 'Switch Tab' },
    ...(activeTab === 'pve'
      ? [
          { button: 'DPadLeftRight' as const, label: 'Currency' },
          { button: 'A' as const, label: 'Purchase' },
        ]
      : [
          ...(hasSections ? [{ button: 'DPadUpDown' as const, label: 'Section' }] : []),
          ...(activeSectionCount > 0
            ? [
                { button: 'DPadLeftRight' as const, label: 'Navigate' },
                { button: 'A' as const, label: 'Select' },
              ]
            : []),
        ]),
    { button: 'B', label: 'Back' },
  ];

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image source={backgroundImage} style={styles.backgroundImage} resizeMode="stretch" />

      <View style={[styles.content, isCompact && compactStyles.content]}>
        {/* Header */}
        <View style={[styles.header, isCompact && compactStyles.header]}>
          {isController ? (
            <View style={[styles.backButton, isCompact && compactStyles.backButton]} />
          ) : (
            <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
              <ImageBackground
                source={buttonV1Source}
                style={[styles.backButton, isCompact && compactStyles.backButton]}
                resizeMode="stretch"
              >
                <Text style={[styles.backButtonText, isCompact && compactStyles.backButtonText]}>
                  Back
                </Text>
              </ImageBackground>
            </TouchableOpacity>
          )}

          <ImageBackground
            source={buttonV4Source}
            style={[styles.titlePanel, isCompact && compactStyles.titlePanel]}
            resizeMode="stretch"
          >
            <Text style={[styles.title, isCompact && compactStyles.title]}>Marketplace</Text>
          </ImageBackground>

          <View style={[styles.headerSpacer, isCompact && compactStyles.headerSpacer]} />
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, isCompact && compactStyles.tabs]}>
          {isController && (
            <Image
              source={iconL1Source}
              style={[styles.tabShoulderIcon, isCompact && compactStyles.tabShoulderIcon]}
              resizeMode="contain"
            />
          )}
          {(['skins', 'items', 'pve'] as const).map((tab) => {
            const tabEl = (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => {
                  playSfx('ui_click');
                  setActiveTab(tab);
                  setPurchaseError(null);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    isCompact && compactStyles.tabText,
                    activeTab === tab && styles.tabTextActive,
                  ]}
                >
                  {tab === 'pve' ? 'PvE' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            );
            return isController && activeTab === tab ? (
              <FocusGlow key={tab} active>
                {tabEl}
              </FocusGlow>
            ) : (
              tabEl
            );
          })}
          {isController && (
            <Image
              source={iconR1Source}
              style={[styles.tabShoulderIcon, isCompact && compactStyles.tabShoulderIcon]}
              resizeMode="contain"
            />
          )}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'skins' && (
            <ScrollView
              style={styles.nftScrollView}
              contentContainerStyle={styles.nftScrollContent}
            >
              {marketplaceLoading && (
                <ActivityIndicator color="#3d2b1f" size={isCompact ? 'large' : 'small'} />
              )}
              {marketplaceError && (
                <Text style={[styles.errorText, isCompact && compactStyles.errorText]}>
                  {marketplaceError}
                </Text>
              )}

              {/* My Skins */}
              <Text
                style={[
                  styles.sectionTitle,
                  isCompact && compactStyles.sectionTitle,
                  isController && sectionFocus === 0 && styles.sectionTitleActive,
                ]}
              >
                My Skins
              </Text>
              {sortedSkins.length === 0 ? (
                <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>
                  No skins yet
                </Text>
              ) : (
                <View style={[styles.nftGrid, isCompact && compactStyles.nftGrid]}>
                  {sortedSkins.map((skin, idx) => {
                    const isListed = skinListings.some((l) => l.listing.asset.equals(skin.address));
                    const isEquipped = profile?.equippedSkin?.equals(skin.address) ?? false;
                    const canList = !isListed && !isEquipped;
                    return (
                      <FocusGlow
                        key={skin.address.toBase58()}
                        active={isController && sectionFocus === 0 && nftFocus === idx}
                      >
                        <NftCard
                          name={skin.name}
                          image={getSkinImage(skin.name)}
                          isEquipped={isEquipped}
                          actionLabel={canList ? 'List' : undefined}
                          onAction={
                            canList ? () => handleListForSale(skin, skin.collection) : undefined
                          }
                          isCompact={isCompact}
                        />
                      </FocusGlow>
                    );
                  })}
                </View>
              )}

              {/* For Sale */}
              <Text
                style={[
                  styles.sectionTitle,
                  isCompact && compactStyles.sectionTitle,
                  isController && sectionFocus === 1 && styles.sectionTitleActive,
                ]}
              >
                For Sale
              </Text>
              {skinListings.length === 0 ? (
                <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>
                  No skins for sale
                </Text>
              ) : (
                <View style={[styles.nftGrid, isCompact && compactStyles.nftGrid]}>
                  {skinListings.map((listing, idx) => {
                    const priceSol = Number(listing.listing.priceLamports) / LAMPORTS_PER_SOL;
                    const isOwnListing = userSkins.some((s) =>
                      s.address.equals(listing.listing.asset)
                    );
                    return (
                      <FocusGlow
                        key={listing.listing.asset.toBase58()}
                        active={isController && sectionFocus === 1 && nftFocus === idx}
                      >
                        <NftCard
                          name={listing.asset.name}
                          image={getSkinImage(listing.asset.name)}
                          priceSol={priceSol}
                          actionLabel={isOwnListing ? 'Cancel' : 'Buy'}
                          onAction={
                            isOwnListing
                              ? () => handleCancelListing(listing)
                              : () => handleBuyNft(listing)
                          }
                          disabled={marketplaceLoading}
                          isCompact={isCompact}
                        />
                      </FocusGlow>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )}
          {activeTab === 'items' && (
            <ScrollView
              style={styles.nftScrollView}
              contentContainerStyle={styles.nftScrollContent}
            >
              {marketplaceLoading && (
                <ActivityIndicator color="#3d2b1f" size={isCompact ? 'large' : 'small'} />
              )}

              {/* My NFT Items */}
              <Text
                style={[
                  styles.sectionTitle,
                  isCompact && compactStyles.sectionTitle,
                  isController && sectionFocus === 0 && styles.sectionTitleActive,
                ]}
              >
                My NFT Items
              </Text>
              {userNftItems.length === 0 ? (
                <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>
                  No NFT items yet
                </Text>
              ) : (
                <View style={[styles.nftGrid, isCompact && compactStyles.nftGrid]}>
                  {userNftItems.map((item, idx) => {
                    const info = findNftItemInfo(item.name) ?? null;
                    const isListed = itemListings.some((l) => l.listing.asset.equals(item.address));
                    return (
                      <FocusGlow
                        key={item.address.toBase58()}
                        active={isController && sectionFocus === 0 && nftFocus === idx}
                      >
                        <NftCard
                          name={info?.name ?? item.name}
                          image={info?.image}
                          emoji={info?.emoji ?? '\u{2728}'}
                          rarity={info?.rarity}
                          actionLabel={!isListed ? 'List' : undefined}
                          onAction={
                            !isListed ? () => handleListForSale(item, item.collection) : undefined
                          }
                          isCompact={isCompact}
                        />
                      </FocusGlow>
                    );
                  })}
                </View>
              )}

              {/* For Sale */}
              <Text
                style={[
                  styles.sectionTitle,
                  isCompact && compactStyles.sectionTitle,
                  isController && sectionFocus === 1 && styles.sectionTitleActive,
                ]}
              >
                For Sale
              </Text>
              {itemListings.length === 0 ? (
                <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>
                  No items for sale
                </Text>
              ) : (
                <View style={[styles.nftGrid, isCompact && compactStyles.nftGrid]}>
                  {itemListings.map((listing, idx) => {
                    const info = findNftItemInfo(listing.asset.name) ?? null;
                    const priceSol = Number(listing.listing.priceLamports) / LAMPORTS_PER_SOL;
                    const isOwnListing = userNftItems.some((i) =>
                      i.address.equals(listing.listing.asset)
                    );
                    return (
                      <FocusGlow
                        key={listing.listing.asset.toBase58()}
                        active={isController && sectionFocus === 1 && nftFocus === idx}
                      >
                        <NftCard
                          name={info?.name ?? listing.asset.name}
                          image={info?.image}
                          emoji={info?.emoji ?? '\u{2728}'}
                          rarity={info?.rarity}
                          priceSol={priceSol}
                          actionLabel={isOwnListing ? 'Cancel' : 'Buy'}
                          onAction={
                            isOwnListing
                              ? () => handleCancelListing(listing)
                              : () => handleBuyNft(listing)
                          }
                          disabled={marketplaceLoading}
                          isCompact={isCompact}
                        />
                      </FocusGlow>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )}
          {activeTab === 'pve' && (
            <View style={styles.pveContent}>
              <Image
                source={sessionPapersSource}
                style={[styles.sessionImage, isCompact && compactStyles.sessionImage]}
                resizeMode="contain"
              />

              <Text style={[styles.priceText, isCompact && compactStyles.priceText]}>
                Price: 0.05 SOL
                {payment.solUsdPrice ? ` (~$${(0.05 * payment.solUsdPrice).toFixed(2)})` : ''}
              </Text>

              <View style={[styles.purchaseArea, isCompact && compactStyles.purchaseArea]}>
                {isCompact && (
                  <View style={[styles.purchaseTokenTop, compactStyles.purchaseTokenTop]}>
                    <PaymentTokenSelector
                      tokens={payment.supportedTokens}
                      selectedToken={payment.selectedToken}
                      onSelectToken={payment.setSelectedToken}
                      quote={payment.quote}
                      isQuoteLoading={payment.isQuoteLoading}
                      solUsdPrice={payment.solUsdPrice}
                      requiredLamports={BigInt(RUN_PRICE_LAMPORTS)}
                      isCompact={isCompact}
                      isController={isController}
                    />
                  </View>
                )}

                <TouchableOpacity
                  onPress={handlePurchase}
                  activeOpacity={0.7}
                  disabled={isPurchasing}
                >
                  <ImageBackground
                    source={buttonV3Source}
                    style={[
                      styles.purchaseButton,
                      isCompact && compactStyles.purchaseButton,
                      isPurchasing && { opacity: 0.6 },
                    ]}
                    resizeMode="stretch"
                  >
                    {isPurchasing ? (
                      <ActivityIndicator color="#1a1a1a" size={isCompact ? 'large' : 'small'} />
                    ) : (
                      <Text
                        style={[
                          styles.purchaseButtonText,
                          isCompact && compactStyles.purchaseButtonText,
                        ]}
                      >
                        Purchase
                      </Text>
                    )}
                  </ImageBackground>
                </TouchableOpacity>

                {!isCompact && (
                  <View style={styles.purchaseTokenLeft}>
                    <PaymentTokenSelector
                      tokens={payment.supportedTokens}
                      selectedToken={payment.selectedToken}
                      onSelectToken={payment.setSelectedToken}
                      quote={payment.quote}
                      isQuoteLoading={payment.isQuoteLoading}
                      solUsdPrice={payment.solUsdPrice}
                      requiredLamports={BigInt(RUN_PRICE_LAMPORTS)}
                      isCompact={isCompact}
                      isController={isController}
                    />
                  </View>
                )}
              </View>

              {purchaseError && (
                <Text style={[styles.errorText, isCompact && compactStyles.errorText]}>
                  {purchaseError}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Bottom-right sessions counter — PvE tab only */}
      {activeTab === 'pve' && (
        <View style={[styles.sessionsContainer, isCompact && compactStyles.sessionsContainer]}>
          <ImageBackground
            source={rectangleSource}
            style={[styles.sessionsFrame, isCompact && compactStyles.sessionsFrame]}
            resizeMode="stretch"
          >
            <Text style={[styles.sessionsText, isCompact && compactStyles.sessionsText]}>
              Current: {availableRuns} Sessions
            </Text>
          </ImageBackground>
        </View>
      )}
      {/* Run Payment Confirmation Modal */}
      {payment.quote && (
        <PaymentConfirmationModal
          visible={showRunPaymentModal}
          quote={payment.quote}
          isDevnet={payment.isDevnet}
          isCompact={isCompact}
          onConfirm={handleRunPaymentConfirm}
          onCancel={() => setShowRunPaymentModal(false)}
        />
      )}
      {/* Price Input Modal */}
      <InlineModal
        visible={showPriceInput}
        transparent
        animationType="fade"
        onRequestClose={() => {
          playSfx('ui_click');
          setShowPriceInput(false);
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            playSfx('ui_click');
            setShowPriceInput(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <ImageBackground
                source={paperPanelSource}
                style={[styles.priceModal, isCompact && compactStyles.priceModal]}
                resizeMode="stretch"
              >
                <PriceInput
                  onConfirm={handleConfirmListing}
                  onCancel={() => {
                    playSfx('ui_click');
                    setShowPriceInput(false);
                  }}
                  isCompact={isCompact}
                />
              </ImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>
      <HubSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onDisconnect={handleDisconnect}
      />
      <ControllerHints hints={controllerHints} horizontal />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6d5b8',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 80,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    marginBottom: 4,
  },
  titlePanel: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: 180,
    height: 60,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 20,
  },
  headerSpacer: {
    width: 80,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  tabShoulderIcon: {
    width: 22,
    height: 22,
    opacity: 0.6,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3d2b1f',
  },
  tabText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#8a7a6a',
  },
  tabTextActive: {
    color: '#3d2b1f',
  },
  tabContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonText: {
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#8a7a6a',
  },
  pveContent: {
    alignItems: 'center',
    gap: 12,
    marginTop: -40,
  },
  purchaseArea: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 96,
  },
  purchaseTokenLeft: {
    position: 'absolute',
    right: '50%',
    marginRight: 92,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  purchaseTokenTop: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sessionImage: {
    width: 175,
    height: 112,
    marginTop: 32,
  },
  priceText: {
    fontFamily: Typography.number,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3d2b1f',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#a33a3a',
    textAlign: 'center',
  },
  purchaseButton: {
    width: 140,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchaseButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 4,
  },
  sessionsContainer: {
    position: 'absolute',
    bottom: 24,
    right: 16,
  },
  sessionsFrame: {
    width: 185,
    height: 55,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionsText: {
    fontFamily: Typography.stat,
    fontSize: 12,
    color: '#1a1a1a',
  },
  nftScrollView: {
    flex: 1,
    width: '100%',
  },
  nftScrollContent: {
    paddingBottom: 20,
    gap: 12,
  },
  nftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: Typography.header,
    fontSize: 16,
    color: '#3d2b1f',
    marginTop: 8,
  },
  sectionTitleActive: {
    color: '#b8860b',
    textDecorationLine: 'underline',
  },
  emptyText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#8a7a6a',
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  priceModal: {
    width: 340,
    height: 340,
    paddingVertical: 40,
    paddingHorizontal: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const compactStyles = StyleSheet.create({
  content: {
    paddingTop: 36,
    paddingHorizontal: 28,
  },
  header: {
    marginBottom: 32,
  },
  backButton: {
    width: 140,
    height: 76,
  },
  backButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  titlePanel: {
    width: 320,
    height: 100,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 36,
  },
  headerSpacer: {
    width: 140,
  },
  tabs: {
    gap: 12,
    marginBottom: 32,
  },
  tabShoulderIcon: {
    width: 36,
    height: 36,
  },
  tabText: {
    fontSize: 24,
  },
  comingSoonText: {
    fontSize: 38,
  },
  purchaseArea: {
    minHeight: 150,
    gap: 12,
  },
  purchaseTokenTop: {
    width: '100%',
    alignItems: 'center',
    transform: [{ scale: 1.05 }],
  },
  sessionImage: {
    width: 620,
    height: 397,
    marginTop: -12,
  },
  priceText: {
    fontSize: 28,
  },
  errorText: {
    fontSize: 20,
  },
  purchaseButton: {
    width: 240,
    height: 80,
  },
  purchaseButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  sessionsContainer: {
    bottom: 28,
    right: 28,
  },
  sessionsFrame: {
    width: 320,
    height: 90,
  },
  sessionsText: {
    fontSize: 20,
  },
  sectionTitle: {
    fontSize: 28,
  },
  emptyText: {
    fontSize: 22,
  },
  nftGrid: {
    gap: 32,
  },
  priceModal: {
    width: 680,
    height: 680,
    padding: 80,
  },
});
