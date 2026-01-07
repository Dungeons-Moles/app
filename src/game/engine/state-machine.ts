/**
 * Game phase state machine for PvE Dungeon Crawler
 * Implements explicit state transitions per constitution P01
 * @see specs/001-pve-dungeon-crawler/research.md R4
 */

import { GamePhase, GameState, TimePhase } from './types';

// ============================================================================
// Valid Phase Transitions
// ============================================================================

/**
 * Defines all valid phase transitions.
 * Per research.md R4: Using explicit transition map for type safety.
 */
const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  [GamePhase.MainMenu]: [GamePhase.Exploration],
  [GamePhase.Exploration]: [
    GamePhase.Combat,
    GamePhase.POIInteraction,
    GamePhase.BossFight,
  ],
  [GamePhase.POIInteraction]: [GamePhase.Exploration],
  [GamePhase.Combat]: [GamePhase.Exploration, GamePhase.Defeat],
  [GamePhase.BossFight]: [
    GamePhase.Exploration,
    GamePhase.Victory,
    GamePhase.Defeat,
  ],
  [GamePhase.Victory]: [GamePhase.MainMenu],
  [GamePhase.Defeat]: [GamePhase.MainMenu],
};

// ============================================================================
// Transition Validation
// ============================================================================

/**
 * Checks if a phase transition is structurally valid.
 * Does not check guards - only checks if the transition exists in the state machine.
 */
export function isValidTransition(from: GamePhase, to: GamePhase): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ============================================================================
// Transition Guards
// ============================================================================

/**
 * Guard: Can the player enter combat from exploration?
 * Requires: in Exploration phase, player HP > 0
 */
export function canEnterCombat(state: GameState): boolean {
  return (
    state.phase === GamePhase.Exploration &&
    state.player.stats.hp > 0
  );
}

/**
 * Guard: Can the player enter a POI interaction?
 * Requires: in Exploration phase
 */
export function canInteractWithPOI(state: GameState): boolean {
  return state.phase === GamePhase.Exploration;
}

/**
 * Guard: Can the boss fight be triggered?
 * Requires: in Exploration phase, Night phase, cycle 3, no moves remaining
 */
export function canTriggerBoss(state: GameState): boolean {
  return (
    state.phase === GamePhase.Exploration &&
    state.time.phase === TimePhase.Night &&
    state.time.cycle === 3 &&
    state.time.movesRemaining === 0
  );
}

/**
 * Guard: Can the player return to exploration after combat?
 * Requires: in Combat phase, combat result is VICTORY
 */
export function canReturnFromCombat(state: GameState): boolean {
  return (
    state.phase === GamePhase.Combat &&
    state.combat !== null &&
    state.combat.result === 'VICTORY'
  );
}

/**
 * Guard: Can the player return to exploration after boss fight?
 * Requires: in BossFight phase, combat result is VICTORY, not final week
 */
export function canReturnFromBossFight(state: GameState): boolean {
  return (
    state.phase === GamePhase.BossFight &&
    state.combat !== null &&
    state.combat.result === 'VICTORY' &&
    state.time.week < 3
  );
}

/**
 * Guard: Can the game transition to victory?
 * Requires: in BossFight phase, week 3, combat result is VICTORY
 */
export function canAchieveVictory(state: GameState): boolean {
  return (
    state.phase === GamePhase.BossFight &&
    state.time.week === 3 &&
    state.combat !== null &&
    state.combat.result === 'VICTORY'
  );
}

/**
 * Guard: Can the game transition to defeat?
 * Requires: in Combat or BossFight phase, combat result is DEFEAT
 */
export function canSufferDefeat(state: GameState): boolean {
  return (
    (state.phase === GamePhase.Combat || state.phase === GamePhase.BossFight) &&
    state.combat !== null &&
    state.combat.result === 'DEFEAT'
  );
}

/**
 * Guard: Can the player return to main menu?
 * Requires: in Victory or Defeat phase
 */
export function canReturnToMenu(state: GameState): boolean {
  return (
    state.phase === GamePhase.Victory ||
    state.phase === GamePhase.Defeat
  );
}

// ============================================================================
// Composite Guard Check
// ============================================================================

/**
 * Checks both structural validity and guard conditions for a transition.
 * Returns true only if the transition is valid AND all guards pass.
 */
export function canTransition(
  state: GameState,
  to: GamePhase
): boolean {
  const from = state.phase;

  // First check structural validity
  if (!isValidTransition(from, to)) {
    return false;
  }

  // Then check specific guards based on target phase
  switch (to) {
    case GamePhase.Exploration:
      // Coming from MainMenu (start game), POIInteraction, Combat, or BossFight
      if (from === GamePhase.MainMenu) return true;
      if (from === GamePhase.POIInteraction) return true;
      if (from === GamePhase.Combat) return canReturnFromCombat(state);
      if (from === GamePhase.BossFight) return canReturnFromBossFight(state);
      return false;

    case GamePhase.Combat:
      return canEnterCombat(state);

    case GamePhase.POIInteraction:
      return canInteractWithPOI(state);

    case GamePhase.BossFight:
      return canTriggerBoss(state);

    case GamePhase.Victory:
      return canAchieveVictory(state);

    case GamePhase.Defeat:
      return canSufferDefeat(state);

    case GamePhase.MainMenu:
      return canReturnToMenu(state);

    default:
      return false;
  }
}
