import { ImageSourcePropType } from 'react-native';

const defaultMoleImage = require('../../assets/entities/characters/default-mole.webp');

const SKIN_IMAGES: Record<string, ImageSourcePropType> = {
  Player2: require('../../assets/entities/characters/playsolana-player2.webp'),
  Wizardio: require('../../assets/entities/characters/magicblock-wizard.webp'),
  'PlaySolana Player': require('../../assets/entities/characters/playsolana-player2.webp'),
};

const SKIN_COMBAT_SCALE: Record<string, number> = {
  Player2: 1.2,
  Wizardio: 1.0,
  'PlaySolana Player': 1.2,
};

const SKIN_DISPLAY_SCALE: Record<string, number> = {
  Player2: 1.4,
  Wizardio: 1.0,
  'PlaySolana Player': 1.4,
};

export function getSkinImage(name: string): ImageSourcePropType | undefined {
  return SKIN_IMAGES[name];
}

export function getSkinDisplayScale(skinName?: string | null): number {
  if (skinName && SKIN_DISPLAY_SCALE[skinName]) {
    return SKIN_DISPLAY_SCALE[skinName];
  }
  return 1.0;
}

export function getSkinCombatScale(skinName?: string | null): number {
  if (skinName && SKIN_COMBAT_SCALE[skinName]) {
    return SKIN_COMBAT_SCALE[skinName];
  }
  return 1.0;
}

/**
 * Returns the character image for the player's equipped skin, or the default mole.
 */
export function getCharacterImage(equippedSkinName?: string | null): ImageSourcePropType {
  if (equippedSkinName && SKIN_IMAGES[equippedSkinName]) {
    return SKIN_IMAGES[equippedSkinName];
  }
  return defaultMoleImage;
}

export { defaultMoleImage };
