/**
 * TopBar Component - Displays week progress timeline
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import type { TimeState } from '../../game/engine/types';
import { TimePhase } from '../../game/engine/types';
import { getWeekProgress } from '../../game/time/progression';


const SUN_ICON = require('../../../assets/icons/ui/sun.webp');
const MOON_ICON = require('../../../assets/icons/ui/moon.webp');
const SKULL_ICON = require('../../../assets/icons/ui/skull.webp');

// Constants for tick calculation
const DAY_TICKS = 10;
const NIGHT_TICKS = 6;
const TOTAL_TICKS = 3 * (DAY_TICKS + NIGHT_TICKS);
const MOVES_PER_TICK = 5;

interface TopBarProps {
  time: TimeState;
  scale?: number;
  onSkullPress?: () => void;
}

export function TopBar({ time, scale = 1, onSkullPress }: TopBarProps) {
  const progress = getWeekProgress(time);

  return (
    <View style={styles.container}>
      <WeekProgressTimeline time={time} progress={progress} scale={scale} onSkullPress={onSkullPress} />
    </View>
  );
}

interface WeekProgressTimelineProps {
  time: TimeState;
  progress: number;
  scale: number;
  onSkullPress?: () => void;
}

function WeekProgressTimeline({ time, scale, onSkullPress }: WeekProgressTimelineProps) {
  const currentTickPosition = useMemo(() => {
    const ticksPerCycle = DAY_TICKS + NIGHT_TICKS;

    if (time.phase === TimePhase.Boss) {
      return TOTAL_TICKS;
    }

    const completedCycles = time.cycle - 1;
    let position = completedCycles * ticksPerCycle;

    if (time.phase === TimePhase.Day) {
      const movesUsed = 50 - time.movesRemaining;
      position += Math.floor(movesUsed / MOVES_PER_TICK);
    } else if (time.phase === TimePhase.Night) {
      position += DAY_TICKS;
      const movesUsed = 30 - time.movesRemaining;
      position += Math.floor(movesUsed / MOVES_PER_TICK);
    }

    return position;
  }, [time]);

  const timelineSegments = useMemo(() => {
    const segments: Array<{
      type: 'day' | 'night';
      cycle: number;
      ticks: number;
      startTick: number;
    }> = [];

    let tickIndex = 0;
    for (let cycle = 1; cycle <= 3; cycle++) {
      segments.push({ type: 'day', cycle, ticks: DAY_TICKS, startTick: tickIndex });
      tickIndex += DAY_TICKS;
      segments.push({ type: 'night', cycle, ticks: NIGHT_TICKS, startTick: tickIndex });
      tickIndex += NIGHT_TICKS;
    }

    return segments;
  }, []);

  const iconSize = 16 * scale;
  const tickW = 2;
  const tickH = 10 * scale;
  const barH = 12 * scale;

  return (
    <View style={[styles.tickBarContainer, { maxWidth: 500 * scale }]}>
      {/* Icons Row */}
      <View style={[styles.iconsRow, { marginBottom: 4 * scale, height: iconSize }]}>
        {timelineSegments.map((segment, index) => {
          const pct = (segment.startTick / (TOTAL_TICKS - 1)) * 100;
          return (
            <View
              key={`icon-${index}`}
              style={{ position: 'absolute', left: `${pct}%`, marginLeft: -(iconSize / 2) }}
            >
              <Image
                source={segment.type === 'day' ? SUN_ICON : MOON_ICON}
                style={{ width: iconSize, height: iconSize }}
                contentFit="contain"
              />
            </View>
          );
        })}
        {/* Skull icon at the end — tappable when onSkullPress provided */}
        {onSkullPress ? (
          <TouchableOpacity
            style={{ position: 'absolute', right: -(iconSize / 2) }}
            onPress={onSkullPress}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Image source={SKULL_ICON} style={{ width: iconSize, height: iconSize }} contentFit="contain" />
          </TouchableOpacity>
        ) : (
          <View style={{ position: 'absolute', right: -(iconSize / 2) }}>
            <Image source={SKULL_ICON} style={{ width: iconSize, height: iconSize }} contentFit="contain" />
          </View>
        )}
      </View>

      {/* Tick Bar Row */}
      <View style={[styles.tickBarBackground, { height: barH }]}>
        {timelineSegments
          .map((segment) =>
            Array.from({ length: segment.ticks }).map((_, tickIdx) => {
              const globalTick = segment.startTick + tickIdx;
              const isCurrent = globalTick === currentTickPosition;
              const isConsumed = globalTick < currentTickPosition;
              return (
                <View
                  key={globalTick}
                  style={[
                    {
                      width: isCurrent ? 3 * scale : tickW,
                      height: isCurrent ? tickH + 6 * scale : tickH,
                      backgroundColor: isCurrent
                        ? '#000000'
                        : isConsumed
                          ? 'rgba(0, 0, 0, 0.3)'
                          : '#000000',
                    },
                  ]}
                />
              );
            })
          )
          .flat()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
  },
  tickBarContainer: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: 500, // Increased max width to accommodate spread
  },
  iconsRow: {
    flexDirection: 'row',
    marginBottom: 4,
    width: '100%',
  },
  iconContainer: {
    alignItems: 'flex-start', // Align icons to the start of their segment
    justifyContent: 'flex-end',
  },
  phaseIcon: {
    width: 16,
    height: 16,
    marginLeft: -7, // Center 16px icon over 2px tick (8px center - 1px center = 7px shift)
  },
  skullContainer: {
    position: 'absolute',
    right: -8, // Center 16px icon over the end edge
    bottom: 0,
  },
  skullIcon: {
    width: 16,
    height: 16,
  },
  tickBarBackground: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 12,
  },
});

export default TopBar;
