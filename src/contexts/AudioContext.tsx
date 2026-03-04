import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Constants ---
const VOLUME_STORAGE_KEY = '@app:audio_volumes';
const DEFAULT_MUSIC_VOLUME = 0.5;
const DEFAULT_SFX_VOLUME = 0.5;
const CROSSFADE_DURATION_MS = 1000;
const FADE_INTERVAL_MS = 50;

// --- Types ---
export type BgmTrack =
  | 'title'
  | 'hub'
  | 'exploration_day'
  | 'exploration_night'
  | 'standard_combat'
  | 'boss_week_1_2'
  | 'boss_week_3'
  | 'victory'
  | 'defeat'
  | 'none';

export type SfxTrack =
  | 'ui_hover'
  | 'ui_click'
  | 'ui_error'
  | 'move_floor'
  | 'move_dig'
  | 'map_reveal'
  | 'gold_pickup'
  | 'poi_rest'
  | 'poi_loot_crate'
  | 'poi_oil_rack'
  | 'poi_scanner'
  | 'poi_rail'
  | 'poi_smuggler'
  | 'poi_anvil'
  | 'poi_kiln'
  | 'poi_geode'
  | 'poi_scrap'
  | 'phase_night'
  | 'ui_page_turn'
  | 'ui_back';

interface AudioVolumes {
  music: number;
  sfx: number;
}

interface PlayBgmOptions {
  resume?: boolean; // Resume from last known position (for exploration tracks)
  crossfade?: boolean; // Whether to crossfade (default true)
}

interface AudioContextType {
  musicVolume: number;
  sfxVolume: number;
  setMusicVolume: (volume: number) => Promise<void>;
  setSfxVolume: (volume: number) => Promise<void>;
  playBgm: (track: BgmTrack, options?: PlayBgmOptions) => Promise<void>;
  playSfx: (track: SfxTrack) => Promise<void>;
  stopBgm: () => Promise<void>;
  isInitialLoading: boolean;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

// --- Asset Mapping (Requires actual files in assets/audio/) ---
const BGM_FILES: Record<Exclude<BgmTrack, 'none'>, number> = {
  title: require('../../assets/audio/music/bgm_title.mp3'),
  hub: require('../../assets/audio/music/bgm_hub.mp3'),
  exploration_day: require('../../assets/audio/music/bgm_exploration_day.mp3'),
  exploration_night: require('../../assets/audio/music/bgm_exploration_night.mp3'),
  standard_combat: require('../../assets/audio/music/bgm_standard_combat.mp3'),
  boss_week_1_2: require('../../assets/audio/music/bgm_boss_week_1_2.mp3'),
  boss_week_3: require('../../assets/audio/music/bgm_boss_week_3.mp3'),
  victory: require('../../assets/audio/music/bgm_victory.mp3'),
  defeat: require('../../assets/audio/music/bgm_defeat.mp3'),
};

const SFX_FILES: Record<SfxTrack, number> = {
  ui_hover: require('../../assets/audio/sfx/ui_hover.wav'),
  ui_click: require('../../assets/audio/sfx/ui_click.wav'),
  ui_error: require('../../assets/audio/sfx/ui_error.wav'),
  move_floor: require('../../assets/audio/sfx/move_floor.wav'),
  move_dig: require('../../assets/audio/sfx/move_dig.wav'),
  map_reveal: require('../../assets/audio/sfx/map_reveal.wav'),
  gold_pickup: require('../../assets/audio/sfx/gold_pickup.wav'),
  poi_rest: require('../../assets/audio/sfx/poi_rest.wav'),
  poi_loot_crate: require('../../assets/audio/sfx/poi_loot_crate.wav'),
  poi_oil_rack: require('../../assets/audio/sfx/poi_oil_rack.wav'),
  poi_scanner: require('../../assets/audio/sfx/poi_scanner.wav'),
  poi_rail: require('../../assets/audio/sfx/poi_rail.wav'),
  poi_smuggler: require('../../assets/audio/sfx/poi_smuggler.wav'),
  poi_anvil: require('../../assets/audio/sfx/poi_anvil.wav'),
  poi_kiln: require('../../assets/audio/sfx/poi_kiln.wav'),
  poi_geode: require('../../assets/audio/sfx/poi_geode.wav'),
  poi_scrap: require('../../assets/audio/sfx/poi_scrap.wav'),
  phase_night: require('../../assets/audio/sfx/phase_night.wav'),
  ui_page_turn: require('../../assets/audio/sfx/ui_page_turn.wav'),
  ui_back: require('../../assets/audio/sfx/ui_back.wav'),
};

// Custom event names for cross-tree mute bridge (web only).
// The SocialSidebar (outside React tree) dispatches 'dm-toggle-mute';
// AudioProvider handles it and dispatches 'dm-mute-state' back.
const TOGGLE_MUTE_EVENT = 'dm-toggle-mute';
const MUTE_STATE_EVENT = 'dm-mute-state';

function dispatchMuteState(muted: boolean) {
  if (Platform.OS !== 'web') return;
  window.dispatchEvent(new CustomEvent(MUTE_STATE_EVENT, { detail: { muted } }));
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const [musicVolume, setMusicVolumeState] = useState<number>(DEFAULT_MUSIC_VOLUME);
  const [sfxVolume, setSfxVolumeState] = useState<number>(DEFAULT_SFX_VOLUME);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Active BGMs. We use an object to allow crossfading (old track fading out while new fades in).
  const activeBgmRef = useRef<{ sound: Audio.Sound; track: BgmTrack } | null>(null);
  const fadingOutBgmRef = useRef<{ sound: Audio.Sound } | null>(null);

  // Store playback positions to resume exploration tracks
  const playbackPositions = useRef<Partial<Record<BgmTrack, number>>>({});

  // Mute bridge state (web only)
  const isMutedRef = useRef(false);
  const preMuteVolumesRef = useRef<{ music: number; sfx: number } | null>(null);

  // Fading interval reference
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Web autoplay policy: browsers block play() until a user gesture.
  // We queue the pending BGM and replay it on the first interaction.
  const userHasInteracted = useRef(Platform.OS !== 'web');
  const pendingBgmRef = useRef<{ track: BgmTrack; options: PlayBgmOptions } | null>(null);

  // --- Initialization ---
  useEffect(() => {
    let mounted = true;

    const initAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const stored = await AsyncStorage.getItem(VOLUME_STORAGE_KEY);
        if (stored && mounted) {
          const parsed: AudioVolumes = JSON.parse(stored);
          setMusicVolumeState(parsed.music ?? DEFAULT_MUSIC_VOLUME);
          setSfxVolumeState(parsed.sfx ?? DEFAULT_SFX_VOLUME);
        }
      } catch (err) {
        console.warn('[AudioContext] Failed to initialize audio:', err);
      } finally {
        if (mounted) setIsInitialLoading(false);
      }
    };

    initAudio();

    return () => {
      mounted = false;
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      if (activeBgmRef.current?.sound) activeBgmRef.current.sound.unloadAsync();
      if (fadingOutBgmRef.current?.sound) fadingOutBgmRef.current.sound.unloadAsync();
    };
  }, []);

  // Web mute bridge: listen for toggle events from SocialSidebar
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Broadcast initial state so the sidebar picks it up on mount
    dispatchMuteState(isMutedRef.current);

    const onToggleMute = () => {
      if (isMutedRef.current) {
        // Unmute — restore saved volumes
        const saved = preMuteVolumesRef.current ?? {
          music: DEFAULT_MUSIC_VOLUME,
          sfx: DEFAULT_SFX_VOLUME,
        };
        isMutedRef.current = false;
        preMuteVolumesRef.current = null;
        setMusicVolumeState(saved.music);
        setSfxVolumeState(saved.sfx);
        saveVolumes(saved.music, saved.sfx);
        if (activeBgmRef.current?.sound && !fadeIntervalRef.current) {
          activeBgmRef.current.sound.setVolumeAsync(saved.music).catch(() => {});
        }
      } else {
        // Mute — save current volumes, set to 0
        preMuteVolumesRef.current = { music: musicVolume, sfx: sfxVolume };
        isMutedRef.current = true;
        setMusicVolumeState(0);
        setSfxVolumeState(0);
        saveVolumes(0, 0);
        if (activeBgmRef.current?.sound) {
          activeBgmRef.current.sound.setVolumeAsync(0).catch(() => {});
        }
      }
      dispatchMuteState(isMutedRef.current);
    };

    window.addEventListener(TOGGLE_MUTE_EVENT, onToggleMute);
    return () => window.removeEventListener(TOGGLE_MUTE_EVENT, onToggleMute);
  }, [musicVolume, sfxVolume]);

  // Ref to hold latest playBgm for the interaction listener callback
  const playBgmRef = useRef<((track: BgmTrack, options?: PlayBgmOptions) => Promise<void>) | null>(
    null
  );

  // Web: listen for first user interaction, then replay queued BGM
  useEffect(() => {
    if (Platform.OS !== 'web' || userHasInteracted.current) return;

    const onInteraction = () => {
      userHasInteracted.current = true;
      document.removeEventListener('click', onInteraction);
      document.removeEventListener('keydown', onInteraction);
      document.removeEventListener('touchstart', onInteraction);

      const pending = pendingBgmRef.current;
      if (pending && playBgmRef.current) {
        pendingBgmRef.current = null;
        playBgmRef.current(pending.track, pending.options);
      }
    };

    document.addEventListener('click', onInteraction);
    document.addEventListener('keydown', onInteraction);
    document.addEventListener('touchstart', onInteraction);

    return () => {
      document.removeEventListener('click', onInteraction);
      document.removeEventListener('keydown', onInteraction);
      document.removeEventListener('touchstart', onInteraction);
    };
  }, []);

  // --- Volume Management ---
  const saveVolumes = async (music: number, sfx: number) => {
    try {
      await AsyncStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify({ music, sfx }));
    } catch (err) {
      console.warn('[AudioContext] Failed to save volumes:', err);
    }
  };

  const setMusicVolume = async (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setMusicVolumeState(clamped);
    await saveVolumes(clamped, sfxVolume);

    // Immediately update active BGM volume if not currently crossfading.
    // (If crossfading, the interval will dynamically update it anyway).
    if (activeBgmRef.current?.sound && !fadeIntervalRef.current) {
      try {
        await activeBgmRef.current.sound.setVolumeAsync(clamped);
      } catch (e) {
        // Ignored
      }
    }
  };

  const setSfxVolume = async (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setSfxVolumeState(clamped);
    await saveVolumes(musicVolume, clamped);
  };

  // --- BGM Management ---

  /**
   * Helper to fade tracks.
   * Modifies volumes incrementally over CROSSFADE_DURATION_MS.
   */
  const startCrossfade = (
    fadeInCb: (vol: number) => void,
    fadeOutCb: (vol: number) => void,
    onComplete: () => void
  ) => {
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

    const steps = CROSSFADE_DURATION_MS / FADE_INTERVAL_MS;
    let currentStep = 0;

    fadeIntervalRef.current = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;

      fadeInCb(progress);
      fadeOutCb(1 - progress);

      if (currentStep >= steps) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
        onComplete();
      }
    }, FADE_INTERVAL_MS);
  };

  const stopCurrentBgmInternal = async (savePositionForTrack?: BgmTrack) => {
    if (activeBgmRef.current) {
      const { sound, track } = activeBgmRef.current;
      if (savePositionForTrack) {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            playbackPositions.current[track] = status.positionMillis;
          }
        } catch (e) {
          // Ignored
        }
      }

      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (e) {
        // Ignored
      }
      activeBgmRef.current = null;
    }
  };

  const playBgm = useCallback(
    async (track: BgmTrack, options: PlayBgmOptions = { resume: false, crossfade: true }) => {
      // Web autoplay: queue the track until the user interacts with the page
      if (!userHasInteracted.current && track !== 'none') {
        pendingBgmRef.current = { track, options };
        return;
      }

      // Don't restart if it's already playing the requested track.
      if (activeBgmRef.current?.track === track) {
        return;
      }

      if (track === 'none') {
        const toSave = activeBgmRef.current?.track;
        if (options.crossfade && activeBgmRef.current) {
          const oldBgm = activeBgmRef.current;
          activeBgmRef.current = null;

          if (toSave) {
            try {
              const status = await oldBgm.sound.getStatusAsync();
              if (status.isLoaded) playbackPositions.current[toSave] = status.positionMillis;
            } catch (e) {}
          }

          startCrossfade(
            () => {}, // No new track to fade in
            (vol) => {
              oldBgm.sound.setVolumeAsync(vol * musicVolume).catch(() => {});
            },
            async () => {
              await oldBgm.sound.stopAsync().catch(() => {});
              await oldBgm.sound.unloadAsync().catch(() => {});
            }
          );
        } else {
          await stopCurrentBgmInternal(toSave);
        }
        return;
      }

      try {
        // Stop any existing fadeout track to clean up dangling sounds
        if (fadingOutBgmRef.current?.sound) {
          await fadingOutBgmRef.current.sound.stopAsync().catch(() => {});
          await fadingOutBgmRef.current.sound.unloadAsync().catch(() => {});
          fadingOutBgmRef.current = null;
        }

        const hasOldBgm = !!activeBgmRef.current;
        const { sound: newSound } = await Audio.Sound.createAsync(
          BGM_FILES[track as Exclude<BgmTrack, 'none'>],
          {
            shouldPlay: false,
            isLooping: true,
            volume: options.crossfade && hasOldBgm ? 0 : musicVolume,
          }
        );

        // Resume position if requested and available
        if (options.resume && playbackPositions.current[track]) {
          await newSound.setPositionAsync(playbackPositions.current[track]!);
        } else {
          playbackPositions.current[track] = 0; // reset
        }

        const oldBgm = activeBgmRef.current;
        const previousTrack = oldBgm?.track;

        activeBgmRef.current = { sound: newSound, track };
        await newSound.playAsync();

        if (options.crossfade && oldBgm) {
          fadingOutBgmRef.current = oldBgm;

          if (previousTrack) {
            try {
              const status = await oldBgm.sound.getStatusAsync();
              if (status.isLoaded) playbackPositions.current[previousTrack] = status.positionMillis;
            } catch (e) {}
          }

          startCrossfade(
            (progress) => {
              newSound.setVolumeAsync(progress * musicVolume).catch(() => {});
            },
            (progress) => {
              oldBgm.sound.setVolumeAsync(progress * musicVolume).catch(() => {});
            },
            async () => {
              await oldBgm.sound.stopAsync().catch(() => {});
              await oldBgm.sound.unloadAsync().catch(() => {});
              if (fadingOutBgmRef.current?.sound === oldBgm.sound) fadingOutBgmRef.current = null;
            }
          );
        } else {
          if (oldBgm) {
            await stopCurrentBgmInternal(previousTrack);
          }
        }
      } catch (err) {
        console.warn(`[AudioContext] Failed to play BGM ${track}:`, err);
      }
    },
    [musicVolume]
  );

  // Keep ref in sync so the interaction listener can call the latest playBgm
  useEffect(() => {
    playBgmRef.current = playBgm;
  }, [playBgm]);

  const stopBgm = useCallback(async () => {
    await stopCurrentBgmInternal(activeBgmRef.current?.track);
  }, []);

  // --- SFX Management ---
  // When a modal closes or a navigation action fires (ui_back / ui_click),
  // suppress the ui_hover that FocusGlow emits when the underlying buttons regain focus.
  const lastNavigationSfxTs = useRef(0);

  // Per-track cooldown to prevent overlapping instances of the same SFX
  // (concurrent instances stack volumes and sound much louder than intended)
  const sfxLastPlayedRef = useRef<Partial<Record<SfxTrack, number>>>({});
  const SFX_COOLDOWN_MS = 80;

  const playSfx = useCallback(
    async (track: SfxTrack) => {
      // Optimization: don't load and play if volume is 0
      if (sfxVolume <= 0) return;

      // Suppress ui_hover triggered by FocusGlow refocus after a modal close / navigation
      if (track === 'ui_hover' && Date.now() - lastNavigationSfxTs.current < 150) {
        return;
      }
      if (track === 'ui_back' || track === 'ui_click') {
        lastNavigationSfxTs.current = Date.now();
      }

      // Prevent overlapping instances of the same SFX track
      const now = Date.now();
      const lastPlayed = sfxLastPlayedRef.current[track] ?? 0;
      if (now - lastPlayed < SFX_COOLDOWN_MS) return;
      sfxLastPlayedRef.current[track] = now;

      try {
        const { sound } = await Audio.Sound.createAsync(SFX_FILES[track], {
          shouldPlay: false,
          volume: sfxVolume,
        });

        // Unload the sound from memory automatically when it finishes playing
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
          }
        });

        await sound.playAsync();
      } catch (err) {
        console.warn(`[AudioContext] Failed to play SFX ${track}:`, err);
      }
    },
    [sfxVolume]
  );

  return (
    <AudioContext.Provider
      value={{
        musicVolume,
        sfxVolume,
        setMusicVolume,
        setSfxVolume,
        playBgm,
        playSfx,
        stopBgm,
        isInitialLoading,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
