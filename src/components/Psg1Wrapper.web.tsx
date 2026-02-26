import type { ReactNode } from 'react';
import { Psg1Simulator } from 'psg1-sim';
import { ScreenVariantProvider } from '../contexts/ScreenVariantContext';
import { SocialSidebar } from './web/SocialSidebar';

/** PSG1 native screen resolution */
const PSG1_W = 1240;
const PSG1_H = 1080;

/**
 * Web — wraps the app in the PSG1 handheld simulator shell.
 * The inner div creates a flex container that fills the simulator's 1240x1080
 * screen area so React Native's flex:1 children expand properly.
 * Always provides 'compact' variant when the simulator is active.
 */
export function Psg1Wrapper({ children }: { children: ReactNode }) {
  // Compact when: simulator is active (viewport larger than PSG1 in at least one dimension
  // on a capable screen), OR viewport matches PSG1 resolution (DevTools testing).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isAtPsg1Resolution = vw <= PSG1_W && vh <= PSG1_H && vw / vh < 1.4;
  const simulatorActive = vw > PSG1_W || vh > PSG1_H;
  const isCompact = simulatorActive || isAtPsg1Resolution;

  return (
    <ScreenVariantProvider variant={isCompact ? 'compact' : 'wide'}>
      <Psg1Simulator enabledRealGamepad>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
          }}
        >
          {children}
        </div>
      </Psg1Simulator>
      <SocialSidebar />
    </ScreenVariantProvider>
  );
}
