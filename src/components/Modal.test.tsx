import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    document.body.style.overflow = '';
  });

  it('traps focus, closes with Escape, and restores the trigger', () => {
    const root = createRoot(container);
    let isOpen = true;
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const render = () => {
      root.render(
        <Modal
          isOpen={isOpen}
          onClose={() => {
            isOpen = false;
            render();
          }}
          title="Station guide"
        >
          <button type="button">Secondary action</button>
        </Modal>,
      );
    };

    act(render);
    act(render);
    const dialog = document.querySelector('[role="dialog"]');
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>('.modal-shell button'),
    ];
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(buttons[0]);
    expect(document.body.style.overflow).toBe('hidden');
    expect(container.inert).toBe(true);

    act(() => {
      buttons.at(-1)?.focus();
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }),
      );
    });
    expect(document.activeElement).toBe(buttons[0]);

    act(() => {
      buttons[0]?.focus();
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', shiftKey: true }),
      );
    });
    expect(document.activeElement).toBe(buttons.at(-1));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(container.inert).toBe(false);
    expect(document.activeElement).toBe(trigger);

    act(() => root.unmount());
    trigger.remove();
  });

  it('dismisses when the backdrop itself is pressed', () => {
    const root = createRoot(container);
    let isOpen = true;
    const render = () => {
      root.render(
        <Modal
          isOpen={isOpen}
          onClose={() => {
            isOpen = false;
            render();
          }}
          title="Event log"
          variant="drawer"
        >
          Ledger entries
        </Modal>,
      );
    };

    act(render);
    const backdrop = document.querySelector('.modal-backdrop');
    expect(backdrop).not.toBeNull();
    act(() => {
      backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    act(() => root.unmount());
  });
});
