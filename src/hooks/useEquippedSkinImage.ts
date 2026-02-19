import { useEffect, useMemo, useState } from 'react';
import { type ImageSourcePropType } from 'react-native';
import type { PublicKey } from '@solana/web3.js';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { parseMetaplexCoreAsset } from '@/services/solana/metaplexCore';
import { getSkinImage, defaultMoleImage } from '@/data/skinImages';

/**
 * Lightweight hook that resolves the equipped skin's image.
 * Does a single getAccountInfo call (not getProgramAccounts) to read the NFT name,
 * then maps name → local image asset.
 * Returns defaultMoleImage if no skin is equipped or the skin has no local image.
 */
export function useEquippedSkinImage(equippedSkin: PublicKey | null | undefined): ImageSourcePropType {
  const { connection } = useSolanaConnection();
  const [skinImage, setSkinImage] = useState<ImageSourcePropType>(defaultMoleImage);

  // Stabilize dependency — only re-run when the pubkey string actually changes
  const skinKeyStr = equippedSkin?.toBase58() ?? null;

  useEffect(() => {
    if (!skinKeyStr || !equippedSkin) {
      setSkinImage(defaultMoleImage);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const accountInfo = await connection.getAccountInfo(equippedSkin);
        if (cancelled || !accountInfo) return;

        const asset = parseMetaplexCoreAsset(equippedSkin, accountInfo.data as Buffer);
        const image = getSkinImage(asset.name);
        setSkinImage(image ?? defaultMoleImage);
      } catch {
        if (!cancelled) setSkinImage(defaultMoleImage);
      }
    })();

    return () => { cancelled = true; };
  }, [skinKeyStr]);

  return skinImage;
}
