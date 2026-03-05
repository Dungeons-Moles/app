import { ImageSourcePropType } from 'react-native';

const defaultMoleImage = require('../../assets/entities/characters/default-mole.webp');

const SKIN_IMAGES: Record<string, ImageSourcePropType> = {
  'MagicBlock Wizard': require('../../assets/entities/characters/magicblock-wizard.webp'),
};

export function getSkinImage(name: string): ImageSourcePropType | undefined {
  return SKIN_IMAGES[name];
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
