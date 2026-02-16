/**
 * Input mode detection — web.
 * Matches the Psg1Wrapper.web.tsx simulatorActive check: when the viewport
 * exceeds the PSG1 native resolution in either dimension, the simulator shell
 * is active and we switch to controller mode.
 */
import { useState, useEffect } from 'react';

export type InputMode = 'touch' | 'controller';

const PSG1_W = 1240;
const PSG1_H = 1080;

function detectMode(): InputMode {
  return window.innerWidth > PSG1_W || window.innerHeight > PSG1_H ? 'controller' : 'touch';
}

export function useInputMode(): InputMode {
  const [mode, setMode] = useState<InputMode>(detectMode);

  useEffect(() => {
    const onResize = () => setMode(detectMode());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return mode;
}
