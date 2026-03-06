import { GEAR_DEFINITIONS } from '../data/gear';
import { NFT_ITEMS } from '../data/nftItems';
import { TOOL_DEFINITIONS } from '../game/entities/items';

const OIL_IMAGES = [
  require('../../assets/icons/oils/ATK.webp'),
  require('../../assets/icons/oils/DIG.webp'),
  require('../../assets/icons/oils/SPD.webp'),
  require('../../assets/icons/oils/ARM.webp'),
] as const;

const itemImages = [
  ...Object.values(GEAR_DEFINITIONS).map((item) => item.image).filter(Boolean),
  ...Object.values(TOOL_DEFINITIONS).map((item) => item.image).filter(Boolean),
  ...Object.values(NFT_ITEMS).map((item) => item.image).filter(Boolean),
];

export const ITEM_AND_OIL_PRELOAD_IMAGES = [...itemImages, ...OIL_IMAGES];

