/**
 * T007: Image preloading hook for entity sprites
 * Preloads and caches images for enemies, bosses, POIs, and player
 * @see specs/003-gdd-mechanics-update/plan.md
 */

import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { ENEMY_IMAGES, BOSS_IMAGES, POI_IMAGES } from '../components/game/entityImages';

// Player image
const playerImage = require('../../assets/characters/default-mole.png');

// Unknown enemy image (question mark)
const unknownEnemyImage = require('../../assets/map/question-mark.png');

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

/**
 * Hook to load entity images for Skia
 */
export function useSkiaEntityImages(): Record<string, SkImage | null> {
  const [images, setImages] = useState<Record<string, SkImage | null>>({});

  useEffect(() => {
    const loadSkiaImages = async () => {
      const loaded: Record<string, SkImage | null> = {};
      const resources = {
        ...ENEMY_IMAGES,
        ...BOSS_IMAGES,
        ...POI_IMAGES,
        player: playerImage,
        unknownEnemy: unknownEnemyImage,
      };

      const promises = Object.entries(resources).map(async ([id, source]) => {
        try {
          const resolved = Image.resolveAssetSource(source);
          if (resolved && resolved.uri) {
            const data = await Skia.Data.fromURI(resolved.uri);
            const image = Skia.Image.MakeImageFromEncoded(data);
            if (image) {
              loaded[id] = image;
            }
          }
        } catch (e) {
          console.warn(`Failed to load Skia image for ${id}`, e);
        }
      });

      await Promise.all(promises);
      setImages(loaded);
    };

    loadSkiaImages();
  }, []);

  return images;
}

/**
 * Get player image source
 */
export function getPlayerImage() {
  return playerImage;
}

export default useEntityImages;
