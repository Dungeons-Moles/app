/**
 * TopBar Component - Displays week progress timeline
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import type { TimeState } from '../../game/engine/types';
import { TimePhase } from '../../game/engine/types';
import { getWeekProgress } from '../../game/time/progression';
import { Typography } from '../../theme/typography';

const SUN_ICON = require('../../../assets/icons/ui/sun.png');
const MOON_ICON = require('../../../assets/icons/ui/moon.png');
const SKULL_ICON = require('../../../assets/icons/ui/skull.png');

// Constants for tick calculation
const DAY_TICKS = 10;
const NIGHT_TICKS = 6;
const TOTAL_TICKS = 3 * (DAY_TICKS + NIGHT_TICKS);
const MOVES_PER_TICK = 5;

interface TopBarProps {
  time: TimeState;
  scale?: number;
}

export function TopBar({ time, scale = 1 }: TopBarProps) {
  const progress = getWeekProgress(time);

  return (
    <View style={styles.container}>
      <WeekProgressTimeline time={time} progress={progress} scale={scale} />
    </View>
  );
}

interface WeekProgressTimelineProps {
  time: TimeState;
  progress: number;
  scale: number;
}

function WeekProgressTimeline({ time, scale }: WeekProgressTimelineProps) {
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
  const wrapperH = 20 * scale;

  return (
    <View style={[styles.tickBarContainer, { maxWidth: 500 * scale }]}>
      {/* Icons Row */}
      <View style={[styles.iconsRow, { marginBottom: 4 * scale }]}>
        {timelineSegments.map((segment, index) => (
          <View
            key={`icon-${index}`}
            style={[styles.iconContainer, { flex: segment.ticks }]}
          >
            {segment.type === 'day' ? (
              <Image source={SUN_ICON} style={{ width: iconSize, height: iconSize, marginLeft: -7 * scale }} resizeMode="contain" />
            ) : (
              <Image source={MOON_ICON} style={{ width: iconSize, height: iconSize, marginLeft: -7 * scale }} resizeMode="contain" />
            )}
          </View>
        ))}
        {/* Skull icon at the end */}
        <View style={[styles.skullContainer, { right: -8 * scale }]}>
          <Image source={SKULL_ICON} style={{ width: iconSize, height: iconSize }} resizeMode="contain" />
        </View>
      </View>

      {/* Tick Bar Row */}
      <View style={[styles.tickBarWrapper, { height: wrapperH }]}>
        <View style={[styles.tickBarBackground, { height: barH }]}>
          {timelineSegments
            .map((segment) =>
              Array.from({ length: segment.ticks }).map((_, tickIdx) => {
                const globalTick = segment.startTick + tickIdx;
                const isConsumed = globalTick < currentTickPosition;
                return (
                  <View
                    key={globalTick}
                    style={[{ width: tickW, height: tickH }, isConsumed ? styles.tickConsumed : styles.tickPending]}
                  />
                );
              })
            )
            .flat()}
        </View>

        <View style={[styles.markerRow, { height: wrapperH }]}>
          <View
            style={[
              styles.positionMarker,
              { left: `${(currentTickPosition / (TOTAL_TICKS - 1)) * 100}%`, top: -2 * scale, marginLeft: -2 * scale },
            ]}
          >
            <Text style={[styles.markerLine, { fontSize: 18 * scale }]}>|</Text>
          </View>
        </View>
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
  tickBarWrapper: {
    height: 20,
    justifyContent: 'center',
    width: '100%',
  },
  tickBarBackground: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 12,
  },
  tick: {
    width: 2,
    height: 10,
  },
  tickPending: {
    backgroundColor: '#000000',
  },
  tickConsumed: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  markerRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
  },
  positionMarker: {
    position: 'absolute',
    top: -2,
    marginLeft: -2,
  },
  markerLine: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
});

export default TopBar;
