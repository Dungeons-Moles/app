/**
 * Phase and Week Label Utilities
 *
 * Utilities for displaying game phase and week information in the UI.
 *
 * @see research.md RD-12: Phase and Week Display
 */

// ============================================================================
// Types
// ============================================================================

/** Game phase enum (matches on-chain Phase) */
export enum Phase {
  Day1 = 0,
  Night1 = 1,
  Day2 = 2,
  Night2 = 3,
  Day3 = 4,
  Night3 = 5,
}

/** Phase category */
export type PhaseType = 'day' | 'night';

/** Phase display information */
export interface PhaseInfo {
  /** Full display label (e.g., "Day 1") */
  label: string;
  /** Short label (e.g., "D1") */
  shortLabel: string;
  /** Phase type */
  type: PhaseType;
  /** Phase number within day/night cycle (1, 2, or 3) */
  number: number;
  /** Whether this is a night phase (enemies move) */
  isNight: boolean;
  /** Whether this is the final night (Night 3 - boss fight) */
  isFinalNight: boolean;
}

/** Week display information */
export interface WeekInfo {
  /** Week number (1-3) */
  number: number;
  /** Full display label (e.g., "Week 1") */
  label: string;
  /** Short label (e.g., "W1") */
  shortLabel: string;
  /** Whether this is the final week */
  isFinalWeek: boolean;
}

// ============================================================================
// Phase Labels
// ============================================================================

/** Phase to human-readable label mapping */
const PHASE_LABELS: Record<Phase, string> = {
  [Phase.Day1]: 'Day 1',
  [Phase.Night1]: 'Night 1',
  [Phase.Day2]: 'Day 2',
  [Phase.Night2]: 'Night 2',
  [Phase.Day3]: 'Day 3',
  [Phase.Night3]: 'Night 3',
};

/** Phase to short label mapping */
const PHASE_SHORT_LABELS: Record<Phase, string> = {
  [Phase.Day1]: 'D1',
  [Phase.Night1]: 'N1',
  [Phase.Day2]: 'D2',
  [Phase.Night2]: 'N2',
  [Phase.Day3]: 'D3',
  [Phase.Night3]: 'N3',
};

// ============================================================================
// Functions
// ============================================================================

/**
 * Get the display label for a phase.
 *
 * @param phase - Phase enum value
 * @returns Human-readable label (e.g., "Day 1")
 */
export function getPhaseLabel(phase: Phase): string {
  return PHASE_LABELS[phase] ?? 'Unknown';
}

/**
 * Get the short label for a phase.
 *
 * @param phase - Phase enum value
 * @returns Short label (e.g., "D1")
 */
export function getPhaseShortLabel(phase: Phase): string {
  return PHASE_SHORT_LABELS[phase] ?? '??';
}

/**
 * Get complete phase information.
 *
 * @param phase - Phase enum value
 * @returns PhaseInfo object
 */
export function getPhaseInfo(phase: Phase): PhaseInfo {
  const isNight = phase % 2 === 1;
  const number = Math.floor(phase / 2) + 1;

  return {
    label: getPhaseLabel(phase),
    shortLabel: getPhaseShortLabel(phase),
    type: isNight ? 'night' : 'day',
    number,
    isNight,
    isFinalNight: phase === Phase.Night3,
  };
}

/**
 * Get complete week information.
 *
 * @param week - Week number (1-3)
 * @returns WeekInfo object
 */
export function getWeekInfo(week: number): WeekInfo {
  return {
    number: week,
    label: `Week ${week}`,
    shortLabel: `W${week}`,
    isFinalWeek: week === 3,
  };
}

/**
 * Get combined week and phase display string.
 *
 * @param week - Week number (1-3)
 * @param phase - Phase enum value
 * @returns Combined display string (e.g., "Week 1 - Day 2")
 */
export function getWeekPhaseLabel(week: number, phase: Phase): string {
  return `Week ${week} - ${getPhaseLabel(phase)}`;
}

/**
 * Get short combined week and phase display string.
 *
 * @param week - Week number (1-3)
 * @param phase - Phase enum value
 * @returns Short display string (e.g., "W1 D2")
 */
export function getWeekPhaseShortLabel(week: number, phase: Phase): string {
  return `W${week} ${getPhaseShortLabel(phase)}`;
}

/**
 * Check if a phase is a night phase.
 *
 * @param phase - Phase enum value
 * @returns true if night phase
 */
export function isNightPhase(phase: Phase): boolean {
  return phase % 2 === 1;
}

/**
 * Check if a phase is a day phase.
 *
 * @param phase - Phase enum value
 * @returns true if day phase
 */
export function isDayPhase(phase: Phase): boolean {
  return phase % 2 === 0;
}

/**
 * Check if the current phase/week combination indicates boss fight ready.
 *
 * @param week - Week number (1-3)
 * @param phase - Phase enum value
 * @param movesRemaining - Moves remaining in current phase
 * @returns true if boss fight should trigger on next move
 */
export function isBossFightReady(week: number, phase: Phase, movesRemaining: number): boolean {
  // Boss fights at end of Night 3 for each week
  return phase === Phase.Night3 && movesRemaining === 0;
}

/**
 * Get the next phase in the cycle.
 *
 * @param phase - Current phase
 * @returns Next phase (wraps from Night3 to Day1)
 */
export function getNextPhase(phase: Phase): Phase {
  return ((phase + 1) % 6) as Phase;
}

/**
 * Calculate progress through the current week as a percentage.
 *
 * @param phase - Current phase
 * @param movesRemaining - Moves remaining in current phase
 * @param totalMovesInPhase - Total moves allowed in this phase
 * @returns Progress percentage (0-100)
 */
export function getWeekProgress(
  phase: Phase,
  movesRemaining: number,
  totalMovesInPhase: number
): number {
  const phasesCompleted = phase;
  const currentPhaseProgress =
    totalMovesInPhase > 0 ? (totalMovesInPhase - movesRemaining) / totalMovesInPhase : 0;

  // Each phase is ~16.67% of the week
  const progressPerPhase = 100 / 6;
  return Math.round(phasesCompleted * progressPerPhase + currentPhaseProgress * progressPerPhase);
}

// ============================================================================
// Color/Style Helpers
// ============================================================================

/**
 * Get the recommended background color for a phase.
 *
 * @param phase - Phase enum value
 * @returns Color string suitable for phase theming
 */
export function getPhaseBackgroundColor(phase: Phase): string {
  return isNightPhase(phase) ? '#1a1a2e' : '#2d3748';
}

/**
 * Get the recommended accent color for a phase.
 *
 * @param phase - Phase enum value
 * @returns Color string suitable for phase accents
 */
export function getPhaseAccentColor(phase: Phase): string {
  return isNightPhase(phase) ? '#6366f1' : '#f59e0b';
}

/**
 * Get the recommended icon for a phase.
 *
 * @param phase - Phase enum value
 * @returns Emoji or icon string
 */
export function getPhaseIcon(phase: Phase): string {
  return isNightPhase(phase) ? '🌙' : '☀️';
}

/**
 * Format phase label from phase number and week.
 * Used by SessionCard and other components that have raw phase/week numbers.
 *
 * @param phase - Phase number (0-5)
 * @param week - Week number (1-3)
 * @returns Formatted label (e.g., "Day 1", "Night 2", "Boss")
 */
export function formatPhaseLabel(phase: number, week: number): string {
  // Handle boss phase (phase === 6 or special flag)
  if (phase === 6) {
    return `Week ${week} Boss`;
  }
  return getPhaseLabel(phase as Phase);
}
