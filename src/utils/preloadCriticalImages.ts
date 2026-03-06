import { Image as ExpoImage } from 'expo-image';
import { Image, Platform, type ImageSourcePropType } from 'react-native';

const preloadedUris = new Set<string>();

function resolveUri(source: ImageSourcePropType): string | null {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && 'uri' in source) {
    return source.uri ?? null;
  }
  return null;
}

function decodeWebImage(uri: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new globalThis.Image();
    img.decoding = 'sync';
    img.loading = 'eager';
    img.src = uri;

    const finish = () => resolve();
    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch {
        // Ignore decode failures and continue with the cached image.
      }
      finish();
    };
    img.onerror = finish;
  });
}

async function preloadImage(source: ImageSourcePropType): Promise<void> {
  const uri = resolveUri(source);
  if (!uri || preloadedUris.has(uri)) return;

  try {
    if (Platform.OS === 'web') {
      await decodeWebImage(uri);
    } else {
      await ExpoImage.prefetch(uri, 'memory-disk');
    }
    preloadedUris.add(uri);
  } catch {
    // Best-effort warmup only.
  }
}

export async function preloadCriticalImages(
  sources: readonly ImageSourcePropType[],
): Promise<void> {
  await Promise.all(sources.map((source) => preloadImage(source)));
}

/**
 * Returns true if every source in the list has already been preloaded
 * by a prior `preloadCriticalImages` call (e.g. during SessionLoadingScreen).
 */
export function areAllPreloaded(sources: readonly ImageSourcePropType[]): boolean {
  for (const source of sources) {
    const uri = resolveUri(source);
    if (uri && !preloadedUris.has(uri)) return false;
  }
  return true;
}
