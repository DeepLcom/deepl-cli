import { attachDebouncedWatchLoop, type WatchEventSource } from '../../src/cli/commands/sync-command';

interface StubWatcher extends WatchEventSource {
  emit: (event: 'change' | 'add', file?: string) => void;
}

function createStubWatcher(): StubWatcher {
  const listeners: Partial<Record<'change' | 'add', Array<(path?: string) => void>>> = {};
  return {
    on(event, listener) {
      (listeners[event] ??= []).push(listener);
      return this;
    },
    emit(event, file) {
      for (const l of listeners[event] ?? []) l(file);
    },
  };
}

describe('attachDebouncedWatchLoop', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('invokes onChange exactly once when several change events arrive within the debounce window', () => {
    const watcher = createStubWatcher();
    const onChange = jest.fn();

    attachDebouncedWatchLoop({ watcher, onChange, debounceMs: 200 });

    watcher.emit('change', 'a.json');
    jest.advanceTimersByTime(50);
    watcher.emit('change', 'a.json');
    jest.advanceTimersByTime(50);
    watcher.emit('change', 'a.json');
    expect(onChange).not.toHaveBeenCalled();

    jest.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('treats add events identically to change events for debouncing', () => {
    const watcher = createStubWatcher();
    const onChange = jest.fn();

    attachDebouncedWatchLoop({ watcher, onChange, debounceMs: 150 });

    watcher.emit('add', 'new.json');
    jest.advanceTimersByTime(149);
    expect(onChange).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('fires onChange twice when two bursts of events are separated by more than the debounce window', () => {
    const watcher = createStubWatcher();
    const onChange = jest.fn();

    attachDebouncedWatchLoop({ watcher, onChange, debounceMs: 100 });

    watcher.emit('change');
    jest.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledTimes(1);

    watcher.emit('change');
    jest.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('clear() cancels a pending debounce timer so onChange is never invoked', () => {
    const watcher = createStubWatcher();
    const onChange = jest.fn();

    const handle = attachDebouncedWatchLoop({ watcher, onChange, debounceMs: 200 });

    watcher.emit('change');
    jest.advanceTimersByTime(150);
    // shutdown mid-debounce — must not invoke onChange
    handle.clear();
    jest.advanceTimersByTime(200);
    expect(onChange).not.toHaveBeenCalled();
  });
});
