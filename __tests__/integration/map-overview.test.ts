import { createInputHandler } from '../../src/game/input/handler';
import { Direction } from '../../src/game/input/types';
import {
  DEFAULT_OVERVIEW_STATE,
  applyOverviewAction,
} from '../../src/contexts/GameContext';
import { resolveInputEnabled } from '../../src/hooks/useInput';

describe('Map Overview Mode Input Blocking', () => {
  it('blocks inputs while overview is active', () => {
    const handler = createInputHandler(0);
    const listener = jest.fn();
    handler.subscribe(listener);

    const overview = applyOverviewAction(DEFAULT_OVERVIEW_STATE, { type: 'TOGGLE', canActivate: true });
    handler.setEnabled(resolveInputEnabled(true, overview.active));

    handler.emitDpadDirection(Direction.Up);

    expect(listener).not.toHaveBeenCalled();
  });

  it('allows inputs when overview is inactive', () => {
    const handler = createInputHandler(0);
    const listener = jest.fn();
    handler.subscribe(listener);

    handler.setEnabled(resolveInputEnabled(true, false));
    handler.emitDpadDirection(Direction.Down);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
