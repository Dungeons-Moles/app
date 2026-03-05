import { ImageSourcePropType } from 'react-native';

export interface NftItemInfo {
  name: string;
  description: string;
  tag: string;
  rarity: string;
  emoji: string;
  image?: ImageSourcePropType;
}

export const NFT_ITEMS: Record<string, NftItemInfo> = {
  'S-XX-01': {
    name: 'Infernal Pickaxe',
    description: 'Deals 2/3/4 damage each turn',
    tag: 'BLAST',
    rarity: 'heroic',
    emoji: '\u{1F525}',
    image: require('../../assets/icons/items/nft/infernal_pickaxe.webp'),
  },
  'S-XX-02': {
    name: 'Phantom Cloak',
    description: 'Dodge the next 1/2/3 attacks',
    tag: 'DODGE',
    rarity: 'heroic',
    emoji: '\u{1F47B}',
  },
  'S-XX-03': {
    name: 'Crown of Greed',
    description: 'Earn 2x/3x/4x gold from battles',
    tag: 'GREED',
    rarity: 'heroic',
    emoji: '\u{1F451}',
  },
  'S-XX-04': {
    name: 'Titan Gauntlets',
    description: '+3/+5/+7 ATK permanently',
    tag: 'STONE',
    rarity: 'heroic',
    emoji: '\u{1F94A}',
  },
  'S-XX-05': {
    name: 'Aegis Shield',
    description: '+3/+5/+7 ARM permanently',
    tag: 'STONE',
    rarity: 'heroic',
    emoji: '\u{1F6E1}\uFE0F',
  },
  'S-XX-06': {
    name: 'Temporal Boots',
    description: '+2/+3/+4 SPD permanently',
    tag: 'SCOUT',
    rarity: 'heroic',
    emoji: '\u{1F462}',
  },
};

export function getNftItemInfo(id: string): NftItemInfo | undefined {
  return NFT_ITEMS[id];
}

/** Look up by either the ID key (e.g. "S-XX-01") or the display name (e.g. "Infernal Pickaxe"). */
export function findNftItemInfo(nameOrId: string): NftItemInfo | undefined {
  if (NFT_ITEMS[nameOrId]) return NFT_ITEMS[nameOrId];
  return Object.values(NFT_ITEMS).find((info) => info.name === nameOrId);
}
