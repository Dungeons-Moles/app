import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_STORAGE_KEY = '@app:settings';

interface Settings {
  autoOpenPOI: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  autoOpenPOI: true,
};

interface SettingsContextType {
  autoOpenPOI: boolean;
  setAutoOpenPOI: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType>({
  autoOpenPOI: DEFAULT_SETTINGS.autoOpenPOI,
  setAutoOpenPOI: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [autoOpenPOI, setAutoOpenPOIState] = useState(DEFAULT_SETTINGS.autoOpenPOI);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<Settings>;
          if (typeof parsed.autoOpenPOI === 'boolean') {
            setAutoOpenPOIState(parsed.autoOpenPOI);
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

  return (
    <SettingsContext.Provider value={{ autoOpenPOI, setAutoOpenPOI }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
