import { useEffect, useState } from 'react';
import { type ImageSourcePropType } from 'react-native';
import type { PublicKey } from '@solana/web3.js';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { parseMetaplexCoreAsset } from '@/services/solana/metaplexCore';
import { getSkinImage, defaultMoleImage } from '@/data/skinImages';

// Module-level cache: avoids the default-image flash when navigating between screens.
// Once a skin is resolved, subsequent hook instances return it immediately.
const skinImageCache = new Map<string, ImageSourcePropType>();

/**
 * Lightweight hook that resolves the equipped skin's image.
 * Does a single getAccountInfo call (not getProgramAccounts) to read the NFT name,
 * then maps name → local image asset.
 * Returns defaultMoleImage if no skin is equipped or the skin has no local image.
 */
export function useEquippedSkinImage(equippedSkin: PublicKey | null | undefined): ImageSourcePropType {
  const { connection } = useSolanaConnection();

  // Stabilize dependency — only re-run when the pubkey string actually changes
  const skinKeyStr = equippedSkin?.toBase58() ?? null;

  const [skinImage, setSkinImage] = useState<ImageSourcePropType>(
    skinKeyStr ? (skinImageCache.get(skinKeyStr) ?? defaultMoleImage) : defaultMoleImage
  );

  useEffect(() => {
    if (!skinKeyStr || !equippedSkin) {
      setSkinImage(defaultMoleImage);
      return;
    }

    // If already cached, set immediately (covers cases where skinKeyStr changed after mount)
    const cached = skinImageCache.get(skinKeyStr);
    if (cached) {
      setSkinImage(cached);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const accountInfo = await connection.getAccountInfo(equippedSkin);
        if (cancelled || !accountInfo) return;

        const asset = parseMetaplexCoreAsset(equippedSkin, accountInfo.data as Buffer);
        const resolved = getSkinImage(asset.name) ?? defaultMoleImage;
        skinImageCache.set(skinKeyStr, resolved);
        setSkinImage(resolved);
      } catch {
        if (!cancelled) setSkinImage(defaultMoleImage);
      }
    })();

    return () => { cancelled = true; };
  }, [skinKeyStr]);

  return skinImage;
}
