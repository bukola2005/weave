import { afterEach, describe, expect, it } from 'vitest';
import { domainEvents } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import { wireDomainToasts } from './realtime';

describe('sync failure toast', () => {
  let unwire: () => void = () => {};
  afterEach(() => {
    unwire();
    useUIStore.setState({ toasts: [], simulateFailures: false });
  });

  it('says the change was undone and names the flaky-sync toggle when it is on', () => {
    unwire = wireDomainToasts();
    useUIStore.setState({ simulateFailures: true });
    domainEvents.emit({ type: 'rollback', label: 'Move “Write tests”' });
    expect(useUIStore.getState().toasts.at(-1)).toMatchObject({
      tone: 'error',
      message: 'Move “Write tests” didn’t sync, so it was undone in this tab. “Simulate flaky sync” is on. Try again, or turn it off.',
    });
  });

  it('just asks to try again when the toggle is off', () => {
    unwire = wireDomainToasts();
    domainEvents.emit({ type: 'rollback', label: 'a comment' });
    expect(useUIStore.getState().toasts.at(-1)?.message).toBe(
      'A comment didn’t sync, so it was undone in this tab. Try again.'
    );
  });
});
