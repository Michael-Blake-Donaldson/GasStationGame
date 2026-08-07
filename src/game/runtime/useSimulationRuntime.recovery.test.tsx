import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock('@tauri-apps/api/core', () => tauri);

import { useSimulationRuntime } from './useSimulationRuntime';

const Harness = () => {
  const runtime = useSimulationRuntime({ seed: 1987, targetNightCount: 3 });
  return (
    <>
      <output data-testid="clock">{runtime.simulation.absoluteClockUnit}</output>
      <button
        disabled={!runtime.isRecoveryReady}
        onClick={() => runtime.chooseTimeMode('normal')}
        type="button"
      >
        Start
      </button>
    </>
  );
};

describe('simulation recovery startup gate', () => {
  let container: HTMLDivElement;
  const pendingReads: ((value: string | null) => void)[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    pendingReads.length = 0;
    tauri.invoke.mockReset();
    tauri.invoke.mockImplementation((command: string) => {
      if (command !== 'read_recovery_slot') {
        return Promise.reject(new Error(`Unexpected command ${command}.`));
      }
      return new Promise<string | null>((resolve) => pendingReads.push(resolve));
    });
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.useRealTimers();
  });

  it('blocks simulation ticks and commands until delayed recovery resolves', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });
    const button = container.querySelector<HTMLButtonElement>('button');
    const initialClock = container.querySelector('output')?.textContent;
    expect(pendingReads).toHaveLength(3);
    expect(button?.disabled).toBe(true);

    await act(async () => {
      button?.click();
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(container.querySelector('output')?.textContent).toBe(initialClock);

    await act(async () => {
      for (const resolve of pendingReads) resolve(null);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(button?.disabled).toBe(false);

    act(() => root.unmount());
  });
});
