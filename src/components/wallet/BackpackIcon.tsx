import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

interface BackpackIconProps {
  size?: number;
  color?: string;
}

export function BackpackIcon({ size = 28, color = '#333333' }: BackpackIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Rect x="24" y="18" width="52" height="12" rx="6" stroke={color} strokeWidth={6} />
      <Path
        d="M20 36C20 29.4 25.4 24 32 24H68C74.6 24 80 29.4 80 36V77C80 83.6 74.6 89 68 89H32C25.4 89 20 83.6 20 77V36Z"
        stroke={color}
        strokeWidth={6}
      />
      <Rect x="34" y="44" width="32" height="22" rx="6" stroke={color} strokeWidth={6} />
      <Path d="M42 55H58" stroke={color} strokeWidth={6} strokeLinecap="round" />
    </Svg>
  );
}
