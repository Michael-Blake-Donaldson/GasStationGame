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

    const normalButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="normal time"]',
    );
    expect(normalButton).not.toBeNull();
    if (normalButton === null) throw new Error('Normal time button is missing.');

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
    const pausedButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="paused time"]',
    );
    const normalButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="normal time"]',
    );
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.getAttribute('aria-atomic')).toBe('true');
    expect(pausedButton).not.toBeNull();
    expect(normalButton).not.toBeNull();
    if (pausedButton === null || normalButton === null) {
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

  it('opens the station guide and exposes selected time mode semantics', () => {
    const root = createRoot(container);

    act(() => {
      root.render(<App />);
    });

    const pausedButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="paused time"]',
    );
    const guideButton = [
      ...container.querySelectorAll<HTMLButtonElement>('button'),
    ].find((button) => button.textContent.includes('Station guide'));
    expect(pausedButton?.getAttribute('aria-pressed')).toBe('true');
    expect(guideButton).toBeDefined();
    if (guideButton === undefined) throw new Error('Station guide button is missing.');

    act(() => {
      guideButton.focus();
      guideButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Keep the station useful.');
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Close Station guide',
    );

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(guideButton);

    act(() => root.unmount());
  });

  it('opens a newest-first event history drawer from the station ledger', () => {
    const root = createRoot(container);

    act(() => {
      root.render(<App />);
    });

    const logButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent.includes('Event log'),
    );
    expect(logButton).toBeDefined();
    if (logButton === undefined) throw new Error('Event log button is missing.');

    act(() => {
      logButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.classList.contains('modal-shell--drawer')).toBe(true);
    expect(dialog?.textContent).toContain('Morning shift opened.');
    expect(dialog?.querySelectorAll('.event-history-list li')).toHaveLength(1);
    expect(dialog?.querySelector('.event-history-list li')?.textContent).toContain(
      'Morning shift opened.',
    );

    act(() => root.unmount());
  });
});
