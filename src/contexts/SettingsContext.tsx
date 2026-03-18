import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_STORAGE_KEY = '@app:settings';

interface Settings {
  autoOpenPOI: boolean;
  autoResolveCombat: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  autoOpenPOI: true,
  autoResolveCombat: false,
};

interface SettingsContextType {
  autoOpenPOI: boolean;
  setAutoOpenPOI: (value: boolean) => void;
  autoResolveCombat: boolean;
  setAutoResolveCombat: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType>({
  autoOpenPOI: DEFAULT_SETTINGS.autoOpenPOI,
  setAutoOpenPOI: () => {},
  autoResolveCombat: DEFAULT_SETTINGS.autoResolveCombat,
  setAutoResolveCombat: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [autoOpenPOI, setAutoOpenPOIState] = useState(DEFAULT_SETTINGS.autoOpenPOI);
  const [autoResolveCombat, setAutoResolveCombatState] = useState(
    DEFAULT_SETTINGS.autoResolveCombat
  );

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<Settings>;
          if (typeof parsed.autoOpenPOI === 'boolean') {
            setAutoOpenPOIState(parsed.autoOpenPOI);
          }
          if (typeof parsed.autoResolveCombat === 'boolean') {
            setAutoResolveCombatState(parsed.autoResolveCombat);
          }
        }
      })
      .catch((err) => console.warn('[SettingsContext] Failed to load settings:', err));
  }, []);

  const persist = useCallback(async (next: Partial<Settings>) => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      const current = stored ? JSON.parse(stored) : {};
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...current, ...next }));
    } catch (err) {
      console.warn('[SettingsContext] Failed to save settings:', err);
    }
  }, []);

  const setAutoOpenPOI = useCallback(
    (value: boolean) => {
      setAutoOpenPOIState(value);
      persist({ autoOpenPOI: value });
    },
    [persist]
  );

  const setAutoResolveCombat = useCallback(
    (value: boolean) => {
      setAutoResolveCombatState(value);
      persist({ autoResolveCombat: value });
    },
    [persist]
  );

  return (
    <SettingsContext.Provider
      value={{ autoOpenPOI, setAutoOpenPOI, autoResolveCombat, setAutoResolveCombat }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
