import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./game/rendering/StationScene', () => ({
  StationScene: () => <div data-testid="station-scene" />,
}));

describe('App simulation timer', () => {
  let container: HTMLDivElement;
  let now = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('advances once under Strict Mode without duplicating accumulator debt', () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    });

    const normalButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent.includes('normal'),
    );
    expect(normalButton).toBeDefined();
    if (normalButton === undefined) throw new Error('Normal time button is missing.');

    act(() => {
      normalButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    for (let callback = 0; callback < 20; callback += 1) {
      now += 50;
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }

    expect(container.querySelector('.clock-panel strong')?.textContent).toBe('8:03 AM');

    act(() => {
      root.unmount();
    });
  });

  it('announces command receipts and subsequent domain events', () => {
    const root = createRoot(container);

    act(() => {
      root.render(<App />);
    });

    const status = container.querySelector('[role="status"]');
    const buttons = [...container.querySelectorAll('button')];
    const pausedButton = buttons.find((button) =>
      button.textContent.includes('paused'),
    );
    const normalButton = buttons.find((button) =>
      button.textContent.includes('normal'),
    );
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.getAttribute('aria-atomic')).toBe('true');
    expect(pausedButton).toBeDefined();
    expect(normalButton).toBeDefined();
    if (pausedButton === undefined || normalButton === undefined) {
      throw new Error('Time controls are missing.');
    }

    act(() => {
      pausedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(status?.textContent).toContain('Time mode is already selected.');

    act(() => {
      normalButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(status?.textContent).toContain('Time mode updated.');

    for (let callback = 0; callback < 2; callback += 1) {
      now += 50;
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }
    expect(status?.textContent).toContain('Time mode set to normal.');

    act(() => {
      root.unmount();
    });
  });
});
