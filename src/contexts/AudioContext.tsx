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

type BgmKey = Exclude<BgmTrack, 'none'>;

export function AudioProvider({ children }: { children: ReactNode }) {
  const [musicVolume, setMusicVolumeState] = useState<number>(DEFAULT_MUSIC_VOLUME);
  const [sfxVolume, setSfxVolumeState] = useState<number>(DEFAULT_SFX_VOLUME);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Preloaded BGM pool — each track has exactly one Sound that lives for the app's lifetime.
  // This prevents orphaned sounds and eliminates native load delay.
  const bgmPoolRef = useRef<Map<BgmKey, Audio.Sound>>(new Map());
  const bgmPoolReady = useRef(false);

  // Currently playing track name (null = nothing playing)
  const activeTrackRef = useRef<BgmKey | null>(null);
  // Track that is fading out (null = no fade in progress)
  const fadingOutTrackRef = useRef<BgmKey | null>(null);

  // Store playback positions to resume exploration tracks
  const playbackPositions = useRef<Partial<Record<BgmTrack, number>>>({});

  // Mute bridge state (web only)
  const isMutedRef = useRef(false);
  const preMuteVolumesRef = useRef<{ music: number; sfx: number } | null>(null);

  // Fading interval reference
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Serialization queue — ensures only one playBgm executes at a time.
  // Without this, rapid calls (e.g. mobile screen transitions) can interleave
  // and leave two tracks playing simultaneously.
  const bgmQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Web autoplay policy: browsers block play() until a user gesture.
  // We queue the pending BGM and replay it on the first interaction.
  const userHasInteracted = useRef(Platform.OS !== 'web');
  const pendingBgmRef = useRef<{ track: BgmTrack; options: PlayBgmOptions } | null>(null);

  // Ref to hold latest musicVolume so callbacks always see current value
  const musicVolumeRef = useRef(musicVolume);
  musicVolumeRef.current = musicVolume;

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

        // Preload all BGM tracks in parallel
        const entries = Object.entries(BGM_FILES) as [BgmKey, number][];
        const results = await Promise.allSettled(
          entries.map(async ([key, asset]) => {
            const { sound } = await Audio.Sound.createAsync(asset, {
              shouldPlay: false,
              isLooping: true,
              volume: 0,
            });
            return [key, sound] as const;
          })
        );

        if (mounted) {
          for (const result of results) {
            if (result.status === 'fulfilled') {
              bgmPoolRef.current.set(result.value[0], result.value[1]);
            }
          }
          bgmPoolReady.current = true;
        }

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
      for (const sound of bgmPoolRef.current.values()) {
        sound.unloadAsync().catch(() => {});
      }
      bgmPoolRef.current.clear();
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
        const activeSound = activeTrackRef.current
          ? bgmPoolRef.current.get(activeTrackRef.current)
          : null;
        if (activeSound && !fadeIntervalRef.current) {
          activeSound.setVolumeAsync(saved.music).catch(() => {});
        }
      } else {
        // Mute — save current volumes, set to 0
        preMuteVolumesRef.current = { music: musicVolume, sfx: sfxVolume };
        isMutedRef.current = true;
        setMusicVolumeState(0);
        setSfxVolumeState(0);
        saveVolumes(0, 0);
        const activeSound = activeTrackRef.current
          ? bgmPoolRef.current.get(activeTrackRef.current)
          : null;
        if (activeSound) {
          activeSound.setVolumeAsync(0).catch(() => {});
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
    if (activeTrackRef.current && !fadeIntervalRef.current) {
      const activeSound = bgmPoolRef.current.get(activeTrackRef.current);
      if (activeSound) {
        activeSound.setVolumeAsync(clamped).catch(() => {});
      }
    }
  };

  const setSfxVolume = async (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setSfxVolumeState(clamped);
    await saveVolumes(musicVolume, clamped);
  };

  // --- BGM Management ---

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

  /** Save position and pause a pool sound (does NOT unload — pool sounds live forever). */
  const pausePoolSound = async (trackKey: BgmKey) => {
    const sound = bgmPoolRef.current.get(trackKey);
    if (!sound) return;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        playbackPositions.current[trackKey] = status.positionMillis;
        await sound.pauseAsync();
      }
    } catch {
      // Ignored — sound may already be stopped
    }
  };

  /** Safety net: pause every pool sound EXCEPT the one about to play.
   *  Catches orphaned tracks that slipped through normal stop logic. */
  const pauseAllExcept = async (except: BgmKey | null) => {
    const promises: Promise<void>[] = [];
    for (const [key, sound] of bgmPoolRef.current.entries()) {
      if (key === except) continue;
      promises.push(
        sound
          .getStatusAsync()
          .then(async (status) => {
            if (status.isLoaded && status.isPlaying) {
              playbackPositions.current[key] = status.positionMillis;
              await sound.pauseAsync();
            }
          })
          .catch(() => {})
      );
    }
    await Promise.all(promises);
  };

  const playBgm = useCallback(
    (track: BgmTrack, options: PlayBgmOptions = { resume: false, crossfade: true }) => {
      // Web autoplay: queue the track until the user interacts with the page
      if (!userHasInteracted.current && track !== 'none') {
        pendingBgmRef.current = { track, options };
        return Promise.resolve();
      }

      // Serialize: chain onto the queue so concurrent calls execute one at a time.
      const job = bgmQueueRef.current.then(async () => {
        // Don't restart if it's already playing the requested track.
        if (activeTrackRef.current === (track === 'none' ? null : track)) {
          return;
        }

        if (!bgmPoolReady.current) return;

        const vol = musicVolumeRef.current;

        // Cancel any in-progress crossfade before doing anything else
        if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }

        // Handle fade-to-silence
        if (track === 'none') {
          const oldTrack = activeTrackRef.current;
          activeTrackRef.current = null;

          if (oldTrack) {
            const oldSound = bgmPoolRef.current.get(oldTrack);
            if (oldSound && options.crossfade) {
              fadingOutTrackRef.current = oldTrack;

              startCrossfade(
                () => {},
                (progress) => {
                  oldSound.setVolumeAsync(progress * vol).catch(() => {});
                },
                async () => {
                  await pausePoolSound(oldTrack);
                  if (fadingOutTrackRef.current === oldTrack) fadingOutTrackRef.current = null;
                }
              );
            } else {
              await pausePoolSound(oldTrack);
            }
          }
          // Safety net: ensure nothing else is still playing
          await pauseAllExcept(null);
          return;
        }

        const newSound = bgmPoolRef.current.get(track);
        if (!newSound) return;

        try {
          // Stop any in-progress fadeout immediately
          if (fadingOutTrackRef.current) {
            await pausePoolSound(fadingOutTrackRef.current);
            fadingOutTrackRef.current = null;
          }

          // Prepare the new sound
          if (options.resume && playbackPositions.current[track]) {
            await newSound.setPositionAsync(playbackPositions.current[track]!);
          } else {
            await newSound.setPositionAsync(0);
            playbackPositions.current[track] = 0;
          }

          const oldTrack = activeTrackRef.current;
          const hasOldBgm = !!oldTrack;

          // Safety net: pause ALL other sounds before starting the new one.
          // This catches orphaned tracks from interrupted crossfades or race conditions.
          await pauseAllExcept(track);

          // Set initial volume for new track
          await newSound.setVolumeAsync(options.crossfade && hasOldBgm ? 0 : vol);
          activeTrackRef.current = track;
          await newSound.playAsync();

          if (options.crossfade && oldTrack) {
            const oldSound = bgmPoolRef.current.get(oldTrack);
            if (oldSound) {
              fadingOutTrackRef.current = oldTrack;

              startCrossfade(
                (progress) => {
                  newSound.setVolumeAsync(progress * vol).catch(() => {});
                },
                (progress) => {
                  oldSound.setVolumeAsync(progress * vol).catch(() => {});
                },
                async () => {
                  await pausePoolSound(oldTrack);
                  if (fadingOutTrackRef.current === oldTrack) fadingOutTrackRef.current = null;
                }
              );
            }
          }
        } catch (err) {
          console.warn(`[AudioContext] Failed to play BGM ${track}:`, err);
        }
      });

      // Update the queue — swallow errors so one failure doesn't block future calls
      bgmQueueRef.current = job.catch(() => {});
      return job;
    },
    [musicVolume]
  );

  // Keep ref in sync so the interaction listener can call the latest playBgm
  useEffect(() => {
    playBgmRef.current = playBgm;
  }, [playBgm]);

  const stopBgm = useCallback(() => {
    const job = bgmQueueRef.current.then(async () => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      activeTrackRef.current = null;
      fadingOutTrackRef.current = null;
      await pauseAllExcept(null);
    });
    bgmQueueRef.current = job.catch(() => {});
    return job;
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
