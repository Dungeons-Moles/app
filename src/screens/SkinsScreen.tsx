import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import type { ImageSourcePropType } from 'react-native';
import { CachedImageBackground } from '../components/common/CachedImageBackground';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { useAudio } from '../contexts/AudioContext';
import { getSkinImage, defaultMoleImage } from '../data/skinImages';
import { HubSettingsModal } from '../components/ui/HubSettingsModal';
import { useProfile } from '../contexts/ProfileContext';
import { useWallet } from '../contexts/WalletContext';
import { useSolanaConnection } from '../contexts/SolanaConnectionContext';
import { parseMetaplexCoreAsset, fetchUserSkinsDas, fetchUserNfts } from '../services/solana/metaplexCore';
import { deriveMarketplaceConfigPda } from '../services/solana/constants';
import { createNftMarketplaceProgram } from '../services/solana/programs';
import { SOLANA_CONFIG } from '../services/solana/config';
import { useEquipSkin } from '../hooks/useEquipSkin';
import { PublicKey } from '@solana/web3.js';
import type { MetaplexCoreAsset } from '../types/solana';

const backgroundImage = require('../../assets/ui/backgrounds/loading-background.webp');
const bookImageMobile = require('../../assets/ui/backgrounds/book-wide.webp');
const bookImageCompact = require('../../assets/ui/backgrounds/book-compact.webp');

const buttonV1Source = require('../../assets/ui/buttons/button-v1.webp');
const buttonGreenSource = require('../../assets/ui/buttons/button-green.webp');
const buttonRedSource = require('../../assets/ui/buttons/button.webp');
const engineImageSource = require('../../assets/ui/illustrations/engine.webp');
const squareFrameSource = require('../../assets/ui/frames/square.webp');
const squareFrameGreenSource = require('../../assets/ui/frames/square-green.webp');

export type SkinData = {
  id: string;
  name: string;
  image: ImageSourcePropType;
  description: string;
  onChainName?: string;
};

/** Display name and description overrides for known on-chain skin names */
const SKIN_META: Record<string, { displayName: string; description: string }> = {
  Wizardio: {
    displayName: 'Wizardio',
    description: 'Real-time Magician (Magicblock)',
  },
  Player2: {
    displayName: 'Player2',
    description: 'The OG gamer (Play Solana)',
  },
  'PlaySolana Player': {
    displayName: 'Player2',
    description: 'The OG gamer (Play Solana)',
  },
};

const DEFAULT_SKIN: SkinData = {
  id: 'default',
  name: 'Default',
  image: defaultMoleImage,
  description: 'The classic mole look',
};


type SkinsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Skins'>;
};

export function SkinsScreen({ navigation }: SkinsScreenProps) {
  const { playSfx } = useAudio();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { profile, refresh: refreshProfile } = useProfile();
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const { equipSkin, unequipSkin, isLoading: isEquipping } = useEquipSkin();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [equippedSkinData, setEquippedSkinData] = useState<SkinData | null>(null);
  const [allOwnedSkins, setAllOwnedSkins] = useState<SkinData[]>([]);
  const skinsCollectionRef = useRef<import('@solana/web3.js').PublicKey | undefined>(undefined);

  // Build skins list: Default + owned skins (deduped)
  const skinsData = useMemo<SkinData[]>(() => {
    if (allOwnedSkins.length > 0) {
      return [DEFAULT_SKIN, ...allOwnedSkins];
    }
    return equippedSkinData ? [DEFAULT_SKIN, equippedSkinData] : [DEFAULT_SKIN];
  }, [equippedSkinData, allOwnedSkins]);

  const [selectedSkin, setSelectedSkin] = useState<SkinData>(DEFAULT_SKIN);
  const [cursorIdx, setCursorIdx] = useState(0);

  const isFocused = useIsFocused();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // Scale factor based on screen width (baseline 890px)
  const wScale = isCompact ? 1 : Math.min(1, screenWidth / 890);
  // Scale skin image based on screen height (base 200px at 400px height)
  const skinImageSize = isCompact ? 440 : Math.round(Math.min(200, screenHeight * 0.4));
  const narrowScreen = screenWidth < 860;
  // Grid cell sizes scaled by width
  const cellSize = isCompact ? 110 : Math.round(74 * wScale);
  const cellMargin = isCompact ? 16 : Math.round(14 * wScale);
  const gridPadLeft = isCompact ? 24 : Math.round(20 * wScale);
  const gridWidth = isCompact ? 528 : gridPadLeft + 4 * (cellSize + cellMargin);

  // Fast path: fetch equipped skin instantly via getAccountInfo (~100ms)
  useEffect(() => {
    if (!isFocused || !profile?.equippedSkin) return;
    let cancelled = false;

    (async () => {
      try {
        const accountInfo = await connection.getAccountInfo(profile.equippedSkin!);
        if (cancelled || !accountInfo) return;
        const asset = parseMetaplexCoreAsset(profile.equippedSkin!, accountInfo.data as Buffer);
        const meta = SKIN_META[asset.name];
        setEquippedSkinData({
          id: asset.address.toBase58(),
          name: meta?.displayName ?? asset.name,
          image: getSkinImage(asset.name) || defaultMoleImage,
          description: meta?.description ?? asset.name,
          onChainName: asset.name,
        });
      } catch (e) {
        console.warn('[SkinsScreen] Failed to fetch equipped skin:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [isFocused, profile?.equippedSkin, connection]);

  // Fetch all owned skins via DAS API (fast) with getProgramAccounts fallback
  useEffect(() => {
    if (!isFocused || !wallet.publicKey) return;
    let cancelled = false;

    const nftsToSkinData = (nfts: MetaplexCoreAsset[]): SkinData[] =>
      nfts.map((nft) => {
        const meta = SKIN_META[nft.name];
        return {
          id: nft.address.toBase58(),
          name: meta?.displayName ?? nft.name,
          image: getSkinImage(nft.name) || defaultMoleImage,
          description: meta?.description ?? nft.name,
          onChainName: nft.name,
        };
      });

    (async () => {
      try {
        // Resolve skins collection address
        if (!skinsCollectionRef.current) {
          const program = createNftMarketplaceProgram(connection);
          const [configPda] = deriveMarketplaceConfigPda();
          const config = await (program.account as any).marketplaceConfig.fetchNullable(configPda);
          if (!config || cancelled) return;
          skinsCollectionRef.current = config.skinsCollection;
        }

        let skins: MetaplexCoreAsset[];
        try {
          // Fast path: DAS API (~200ms)
          skins = await fetchUserSkinsDas(
            SOLANA_CONFIG.rpcUrl,
            wallet.publicKey!,
            skinsCollectionRef.current,
          );
        } catch {
          // Fallback: getProgramAccounts (~3.5s)
          skins = await fetchUserNfts(connection, wallet.publicKey!, skinsCollectionRef.current);
        }

        if (!cancelled) setAllOwnedSkins(nftsToSkinData(skins));
      } catch (e) {
        console.warn('[SkinsScreen] Failed to fetch all skins:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [isFocused, wallet.publicKey, connection]);

  // Update selection when skins list changes (e.g. after fetch)
  useEffect(() => {
    if (profile?.equippedSkin) {
      const equippedKey = profile.equippedSkin.toBase58();
      const idx = skinsData.findIndex((s) => s.id === equippedKey);
      if (idx >= 0) {
        setSelectedSkin(skinsData[idx]);
        setCursorIdx(idx);
      }
    }
  }, [skinsData, profile?.equippedSkin]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleBack = useCallback(() => {
    playSfx('ui_back');
    navigation.goBack();
  }, [navigation, playSfx]);

  const handleEquip = useCallback(async () => {
    if (isEquipping || !selectedSkin || selectedSkin.id === 'default') return;
    playSfx('ui_click');

    const isCurrentlyEquipped = profile?.equippedSkin
      ? selectedSkin.id === profile.equippedSkin.toBase58()
      : false;

    let result;
    if (isCurrentlyEquipped) {
      result = await unequipSkin();
    } else {
      result = await equipSkin(new PublicKey(selectedSkin.id));
    }

    if (result.success) {
      await refreshProfile();
    }
  }, [selectedSkin, isEquipping, profile?.equippedSkin, equipSkin, unequipSkin, refreshProfile, playSfx]);

  const inputMode = useInputMode();
  const isController = inputMode === 'controller';

  const handleSelectSkin = (skin: SkinData, index: number) => {
    playSfx('ui_hover');
    setSelectedSkin(skin);
    setCursorIdx(index);
  };

  useControllerAction(
    {
      onB: handleBack,
      onA: handleEquip,
      onDPadLeft: () => {
        setCursorIdx((p) => {
          const newIdx = Math.max(0, p - 1);
          setSelectedSkin(skinsData[newIdx]);
          return newIdx;
        });
      },
      onDPadRight: () => {
        setCursorIdx((p) => {
          const newIdx = Math.min(skinsData.length - 1, p + 1);
          setSelectedSkin(skinsData[newIdx]);
          return newIdx;
        });
      },
      onDPadUp: () => {
        setCursorIdx((p) => {
          const newIdx = Math.max(0, p - 4);
          setSelectedSkin(skinsData[newIdx]);
          return newIdx;
        });
      },
      onDPadDown: () => {
        setCursorIdx((p) => {
          const newIdx = Math.min(skinsData.length - 1, p + 4);
          setSelectedSkin(skinsData[newIdx]);
          return newIdx;
        });
      },
      onStart: () => {
        playSfx('ui_click');
        setShowSettingsModal(true);
      },
    },
    isController && isFocused && !showSettingsModal
  );

  const controllerHints: ButtonHint[] = [
    { button: 'DPad', label: 'Navigate' },
    ...(selectedSkin?.id !== 'default' ? [{
      button: 'A' as const,
      label: profile?.equippedSkin && selectedSkin?.id === profile.equippedSkin.toBase58() ? 'Unequip' : 'Equip',
    }] : []),
    { button: 'B', label: 'Back' },
  ];

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image source={backgroundImage} style={styles.backgroundImage} contentFit="fill" />
      <Image
        source={isCompact ? bookImageCompact : bookImageMobile}
        style={styles.backgroundImage}
        contentFit="fill"
      />

      <View style={[styles.content, isCompact && compactStyles.content]}>
        {/* Header */}
        <View style={[styles.header, isCompact && compactStyles.header]}>
          {!isController && (
            <TouchableOpacity
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <CachedImageBackground
                source={buttonV1Source}
                style={[styles.backButton, isCompact && compactStyles.backButton]}
                resizeMode="stretch"
              >
                <Text style={[styles.backButtonText, isCompact && compactStyles.backButtonText]}>
                  Back
                </Text>
              </CachedImageBackground>
            </TouchableOpacity>
          )}
          {!isController && (
            <View style={styles.headerRight}>
              <TouchableOpacity
                onPress={() => {
                  playSfx('ui_click');
                  setShowSettingsModal(true);
                }}
                activeOpacity={0.7}
              >
                <CachedImageBackground
                  source={buttonV1Source}
                  style={[styles.settingsBtn, isCompact && compactStyles.settingsBtn]}
                  resizeMode="stretch"
                >
                  <Image
                    source={engineImageSource}
                    style={[styles.settingsIconImage, isCompact && compactStyles.settingsIconImage]}
                    contentFit="contain"
                  />
                </CachedImageBackground>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Two-column layout */}
        <View style={styles.columnsContainer}>
          {/* Left column - Grid */}
          <View style={[styles.leftColumn, isCompact && compactStyles.leftColumn]}>
            <Text style={[styles.pageTitle, isCompact && compactStyles.pageTitle, narrowScreen && styles.pageTitleRight]}>
              Skins Journal
            </Text>
            <View style={styles.divider} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={[styles.gridContainer, isCompact && compactStyles.gridContainer, !isCompact && { paddingLeft: gridPadLeft, width: gridWidth }]}>
                {skinsData.map((skin, idx) => {
                  const isSelected = selectedSkin.id === skin.id;
                  const isEquipped = profile?.equippedSkin
                    ? skin.id === profile.equippedSkin.toBase58()
                    : skin.id === 'default';
                  const isCursorItem = isController && idx === cursorIdx;

                  const cell = (
                    <TouchableOpacity
                      key={skin.id}
                      style={[styles.gridCellWrapper, isCompact && compactStyles.gridCellWrapper, !isCompact && { width: cellSize, marginRight: cellMargin }]}
                      onPress={() => handleSelectSkin(skin, idx)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.imageContainer,
                          isCompact && compactStyles.imageContainer,
                          !isCompact && { width: cellSize, height: cellSize },
                          isSelected && styles.imageContainerSelected,
                        ]}
                      >
                        <View style={styles.skinCropLayer}>
                          <Image
                            source={skin.image}
                            style={[
                              styles.skinImageSmall,
                              isCompact && compactStyles.skinImageSmall,
                            ]}
                            contentFit="cover"
                            contentPosition="top"
                          />
                        </View>
                        <Image
                          source={isEquipped ? squareFrameGreenSource : squareFrameSource}
                          style={styles.frameOverlay}
                          contentFit="fill"
                        />

                      </View>

                      <Text
                        style={[
                          styles.skinNameSmall,
                          isCompact && compactStyles.skinNameSmall,
                        ]}
                        numberOfLines={1}
                      >
                        {skin.name}
                      </Text>
                    </TouchableOpacity>
                  );

                  return isCursorItem ? (
                    <View key={skin.id}>
                      <FocusGlow active>{cell}</FocusGlow>
                    </View>
                  ) : (
                    <View key={skin.id}>{cell}</View>
                  );
                })}
              </View>

              {/* Added bottom padding for scroll */}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>

          {/* Right column - Details */}
          <View style={[styles.rightColumn, isCompact && compactStyles.rightColumn]}>
            {selectedSkin && selectedSkin.id !== 'default' && !isController && (() => {
              const isSelectedEquipped = profile?.equippedSkin
                ? selectedSkin.id === profile.equippedSkin.toBase58()
                : false;
              return (
                <TouchableOpacity
                  onPress={handleEquip}
                  activeOpacity={0.7}
                  disabled={isEquipping}
                  style={[styles.equipToggleButton, isCompact && compactStyles.equipToggleButton]}
                >
                  <CachedImageBackground
                    source={isSelectedEquipped ? buttonRedSource : buttonGreenSource}
                    style={[styles.equipToggleButtonBg, isCompact && compactStyles.equipToggleButtonBg]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.equipToggleButtonText, isCompact && compactStyles.equipToggleButtonText]}>
                      {isEquipping ? '...' : isSelectedEquipped ? 'Unequip' : 'Equip'}
                    </Text>
                  </CachedImageBackground>
                </TouchableOpacity>
              );
            })()}
            {selectedSkin && (
              <>
                <Image
                  source={selectedSkin.image}
                  style={[styles.largeSkinImage, isCompact && compactStyles.largeSkinImage, !isCompact && { width: skinImageSize, height: skinImageSize }]}
                  contentFit="contain"
                />
                <Text
                  style={[styles.selectedSkinName, isCompact && compactStyles.selectedSkinName]}
                >
                  {selectedSkin.name}
                </Text>
                <View style={styles.shortDivider} />
                <Text style={[styles.skinDescription, isCompact && compactStyles.skinDescription]}>
                  {selectedSkin.description}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      <HubSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onDisconnect={() => {
          setShowSettingsModal(false);
          navigation.goBack();
        }}
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
    paddingTop: 32,
    paddingHorizontal: 64,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -4,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  equipToggleButton: {
    position: 'absolute',
    top: 34,
    right: 0,
    zIndex: 10,
  },
  equipToggleButtonBg: {
    width: 80,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equipToggleButtonText: {
    fontFamily: Typography.button,
    fontSize: 12,
    color: '#fff',
    marginBottom: 2,
  },
  settingsBtn: {
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIconImage: {
    width: 22,
    height: 22,
    marginBottom: 4,
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
  columnsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 32,
    marginTop: -20,
  },
  leftColumn: {
    flex: 1,
    paddingRight: 16,
    alignItems: 'center',
  },
  rightColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontFamily: Typography.header,
    fontSize: 24,
    color: '#3d2b1f',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  pageTitleRight: {
    alignSelf: 'flex-end',
  },
  divider: {
    height: 1,
    backgroundColor: '#3d2b1f',
    width: '100%',
    marginVertical: 8,
    opacity: 0.3,
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 8,
    width: '100%',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingLeft: 20,
    width: 372, // 20 + 4*(74 width + 14 margin) = 372 exactly
  },
  gridCellWrapper: {
    width: 74,
    alignItems: 'center',
    marginRight: 14,
    marginBottom: 18,
  },
  imageContainer: {
    width: 74,
    height: 74,
    marginBottom: 6,
    position: 'relative',
    borderRadius: 4,
  },
  imageContainerSelected: {
    backgroundColor: 'rgba(250,188,15,0.14)',
  },
  skinCropLayer: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    overflow: 'hidden',
  },
  skinImageSmall: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.6 }, { translateY: 16 }],
  },
  frameOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  skinNameSmall: {
    fontFamily: Typography.header,
    fontSize: 12,
    color: '#3d2b1f',
    textAlign: 'center',
  },
  largeSkinImage: {
    width: 200,
    height: 200,
    marginBottom: 16,
  },
  selectedSkinName: {
    fontFamily: Typography.header,
    fontSize: 28,
    color: '#3d2b1f',
    fontStyle: 'italic',
  },
  shortDivider: {
    height: 1,
    backgroundColor: '#3d2b1f',
    width: 150,
    marginVertical: 12,
    opacity: 0.5,
  },
  skinDescription: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#3d2b1f',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
  },
});

const compactStyles = StyleSheet.create({
  content: {
    paddingTop: 130,
    paddingHorizontal: 88,
    paddingBottom: 160,
  },
  header: {
    marginBottom: 12,
  },
  backButton: {
    width: 140,
    height: 76,
  },
  backButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  pageTitle: {
    fontSize: 36,
  },
  leftColumn: {
    marginTop: 40,
  },
  gridContainer: {
    paddingLeft: 24,
    width: 528, // 24 + 4 * (110 + 16) = 528
  },
  gridCellWrapper: {
    width: 110,
    marginRight: 16,
    marginBottom: 24,
  },
  imageContainer: {
    width: 110,
    height: 110,
  },
  skinImageSmall: {
    transform: [{ scale: 1.6 }, { translateY: 22 }],
  },
  skinNameSmall: {
    fontSize: 18,
  },
  rightColumn: {
    paddingLeft: 40,
    marginTop: 40,
  },
  largeSkinImage: {
    width: 440,
    height: 440,
  },
  selectedSkinName: {
    fontSize: 42,
  },
  skinDescription: {
    fontSize: 22,
    lineHeight: 30,
  },
  equipToggleButton: {},
  equipToggleButtonBg: {
    width: 180,
    height: 52,
  },
  equipToggleButtonText: {
    fontSize: 18,
  },
  settingsBtn: {
    width: 76,
    height: 76,
  },
  settingsIconImage: {
    width: 36,
    height: 36,
  },
});
