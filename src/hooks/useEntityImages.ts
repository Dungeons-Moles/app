/**
 * T007: Image preloading hook for entity sprites
 * Preloads and caches images for enemies, bosses, POIs, and player
 * @see specs/003-gdd-mechanics-update/plan.md
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, type ImageSourcePropType } from 'react-native';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { ENEMY_IMAGES, BOSS_IMAGES, POI_IMAGES } from '../components/game/entityImages';

// Player image
const playerImage = require('../../assets/entities/characters/default-mole.webp');

// Unknown enemy image (question mark)
const unknownEnemyImage = require('../../assets/world/markers/question-mark.webp');

// Collect all images for preloading
const ALL_ENTITY_IMAGES = [
  playerImage,
  unknownEnemyImage,
  ...Object.values(ENEMY_IMAGES),
  ...Object.values(BOSS_IMAGES),
  ...Object.values(POI_IMAGES),
];

export interface EntityImagesState {
  loaded: boolean;
  error: string | null;
}

/**
 * Hook to preload entity images at app startup (for RN Image)
 * Returns loading state
 */
export function useEntityImages(): EntityImagesState {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const preloadImages = async () => {
      try {
        const imagePromises = ALL_ENTITY_IMAGES.map((source) => {
          return new Promise<void>((resolve) => {
            const resolved = Image.resolveAssetSource(source);
            if (resolved && resolved.uri) {
              Image.prefetch(resolved.uri)
                .then(() => resolve())
                .catch(() => {
                  resolve();
                });
            } else {
              resolve();
            }
          });
        });

        await Promise.all(imagePromises);
        setLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load entity images');
        setLoaded(true);
      }
    };

    preloadImages();
  }, []);

  return {
    loaded,
    error,
  };
}

/** Helper: load a single image source into a Skia SkImage */
async function loadSkiaImage(source: any): Promise<SkImage | null> {
  try {
    const resolved = Image.resolveAssetSource(source);
    if (resolved && resolved.uri) {
      const data = await Skia.Data.fromURI(resolved.uri);
      return Skia.Image.MakeImageFromEncoded(data);
    }
  } catch (e) {
    console.warn('Failed to load Skia image', e);
  }
  return null;
}

/** Free a Skia image's native bitmap memory — the JS GC never reclaims it. */
function disposeImage(img: SkImage | null | undefined) {
  (img as unknown as { dispose?: () => void } | null | undefined)?.dispose?.();
}

/**
 * Hook to load entity images for Skia.
 * Pass playerSkinSource to override the default mole with an equipped skin.
 * Static images (enemies, bosses, POIs) load once. Only the player image
 * reloads when the skin changes.
 */
export function useSkiaEntityImages(
  playerSkinSource?: ImageSourcePropType,
  pvpOpponentSkinSource?: ImageSourcePropType,
): Record<string, SkImage | null> {
  const [baseImages, setBaseImages] = useState<Record<string, SkImage | null>>({});
  const [playerSkiaImage, setPlayerSkiaImage] = useState<SkImage | null>(null);
  const [opponentSkiaImage, setOpponentSkiaImage] = useState<SkImage | null>(null);

  // Mirror every loaded Skia image in a ref so the unmount cleanup can dispose
  // them — they hold native bitmap memory that JS garbage collection ignores.
  const baseImagesRef = useRef<Record<string, SkImage | null>>({});
  const playerImageRef = useRef<SkImage | null>(null);
  const opponentImageRef = useRef<SkImage | null>(null);

  // Stabilize the skin source — only reload when the resolved URI actually changes
  const resolvedPlayerImage = playerSkinSource ?? playerImage;
  const playerUri = useMemo(
    () => Image.resolveAssetSource(resolvedPlayerImage)?.uri ?? '',
    [resolvedPlayerImage]
  );
  const prevPlayerUri = useRef(playerUri);

  const resolvedOpponentImage = pvpOpponentSkinSource ?? playerImage;
  const opponentUri = useMemo(
    () => Image.resolveAssetSource(resolvedOpponentImage)?.uri ?? '',
    [resolvedOpponentImage]
  );
  const prevOpponentUri = useRef(opponentUri);

  // Load all static images once
  useEffect(() => {
    let cancelled = false;
    const loadStatic = async () => {
      const loaded: Record<string, SkImage | null> = {};
      const resources = {
        ...ENEMY_IMAGES,
        ...BOSS_IMAGES,
        ...POI_IMAGES,
        unknownEnemy: unknownEnemyImage,
      };

      const promises = Object.entries(resources).map(async ([id, source]) => {
        const img = await loadSkiaImage(source);
        if (img) loaded[id] = img;
      });

      await Promise.all(promises);
      if (cancelled) {
        Object.values(loaded).forEach(disposeImage);
        return;
      }
      baseImagesRef.current = loaded;
      setBaseImages(loaded);
    };
    loadStatic();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load player image separately — only reloads when the skin URI changes
  useEffect(() => {
    if (playerUri === prevPlayerUri.current && playerSkiaImage !== null) return;
    prevPlayerUri.current = playerUri;

    let cancelled = false;
    (async () => {
      const img = await loadSkiaImage(resolvedPlayerImage);
      if (cancelled) {
        disposeImage(img);
        return;
      }
      playerImageRef.current = img;
      setPlayerSkiaImage(img);
    })();
    return () => { cancelled = true; };
  }, [playerUri]);

  // Load PvP opponent image — only reloads when the opponent skin URI changes
  useEffect(() => {
    if (opponentUri === prevOpponentUri.current && opponentSkiaImage !== null) return;
    prevOpponentUri.current = opponentUri;

    let cancelled = false;
    (async () => {
      const img = await loadSkiaImage(resolvedOpponentImage);
      if (cancelled) {
        disposeImage(img);
        return;
      }
      opponentImageRef.current = img;
      setOpponentSkiaImage(img);
    })();
    return () => { cancelled = true; };
  }, [opponentUri]);

  // Dispose every Skia image when the hook unmounts (leaving the game screen).
  // Without this the decoded bitmaps pile up on every mount and the app's
  // memory climbs until it thrashes and the whole game turns sluggish.
  useEffect(
    () => () => {
      Object.values(baseImagesRef.current).forEach(disposeImage);
      disposeImage(playerImageRef.current);
      disposeImage(opponentImageRef.current);
    },
    []
  );

  return useMemo(() => ({
    ...baseImages,
    player: playerSkiaImage,
    pvpOpponent: opponentSkiaImage,
  }), [baseImages, playerSkiaImage, opponentSkiaImage]);
}

/**
 * Get player image source
 */
export function getPlayerImage() {
  return playerImage;
}

export default useEntityImages;
