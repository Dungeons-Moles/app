import React, { createContext, useContext, type ReactNode } from 'react';

export type ScreenVariant = 'compact' | 'wide';

const ScreenVariantContext = createContext<ScreenVariant>('wide');

export function ScreenVariantProvider({
  variant,
  children,
}: {
  variant: ScreenVariant;
  children: ReactNode;
}) {
  return <ScreenVariantContext.Provider value={variant}>{children}</ScreenVariantContext.Provider>;
}

export function useScreenVariant(): ScreenVariant {
  return useContext(ScreenVariantContext);
}
