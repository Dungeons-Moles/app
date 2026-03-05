import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Psg1Simulator } from 'psg1-sim';
import { ScreenVariantProvider } from '../contexts/ScreenVariantContext';
import { SocialSidebar } from './web/SocialSidebar';
import { MobileLanding } from './web/MobileLanding';

/** PSG1 native screen resolution */
const PSG1_W = 1240;
const PSG1_H = 1080;

/** When true, mobile browsers see the full app instead of the landing page. */
const FORCE_MOBILE_APP = process.env.EXPO_PUBLIC_MOBILE_WEB_APP === 'true';

/** Detect mobile browsers via UA + touch capability. */
function isMobileBrowser(): boolean {
  if (FORCE_MOBILE_APP) return false;
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua);
  const smallViewport = window.innerWidth < 1024 && window.innerHeight < 1024;
  return mobileUA && smallViewport;
}

/**
 * Web — wraps the app in the PSG1 handheld simulator shell.
 * The inner div creates a flex container that fills the simulator's 1240x1080
 * screen area so React Native's flex:1 children expand properly.
 * Always provides 'compact' variant when the simulator is active.
 *
 * On mobile browsers, shows a simplified landing page with logo and links.
 */
export function Psg1Wrapper({ children }: { children: ReactNode }) {
  const forcedLandscapeRef = useRef(false);
  const [isMobile] = useState(isMobileBrowser);

  useEffect(() => {
    if (isMobile || forcedLandscapeRef.current) return;

    const forceLandscape = () => {
      const toggle = document.querySelector<HTMLButtonElement>(
        'button[title="Switch to landscape layout"]'
      );
      if (!toggle) return false;
      toggle.click();
      forcedLandscapeRef.current = true;
      return true;
    };

    if (forceLandscape()) return;

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      if (forceLandscape() || attempts >= 20) {
        window.clearInterval(interval);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [isMobile]);

  if (isMobile) {
    return <MobileLanding />;
  }

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
