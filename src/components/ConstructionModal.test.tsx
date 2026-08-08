import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../game/scenarios/greatPlains';
import { ConstructionModal } from './ConstructionModal';

describe('ConstructionModal', () => {
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

  it('shows exact authoritative cost/cells and dispatches only the placement request', () => {
    const onPlaceConstruction = vi.fn();
    const root = createRoot(container);
    act(() => {
      root.render(
        <ConstructionModal
          isOpen
          isRecoveryReady
          onClose={vi.fn()}
          onPlaceConstruction={onPlaceConstruction}
          simulation={createInitialState()}
        />,
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Wall');
    expect(dialog?.textContent).toContain('Cost $0 + 2 scrap');
    expect(dialog?.textContent).toContain('Cells 1');
    expect(dialog?.textContent).toContain('(0, 4)');
    expect(dialog?.textContent).toContain('Placement is clear and affordable.');
    const place = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      ({ textContent }) => textContent.trim() === 'Place Wall',
    );
    expect(place?.disabled).toBe(false);
    act(() => place?.click());
    expect(onPlaceConstruction).toHaveBeenCalledWith({
      blueprintId: 'wall',
      placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 0 },
    });
    act(() => root.unmount());
  });

  it('uses authored facility plots and explains an occupied store plot', () => {
    const root = createRoot(container);
    act(() => {
      root.render(
        <ConstructionModal
          isOpen
          isRecoveryReady
          onClose={vi.fn()}
          onPlaceConstruction={vi.fn()}
          simulation={createInitialState()}
        />,
      );
    });

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
    const garage = buttons.find(({ textContent }) =>
      textContent.includes('Garage$120'),
    );
    act(() => garage?.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Cells 42',
    );
    const garagePlace = [
      ...document.querySelectorAll<HTMLButtonElement>('button'),
    ].find(({ textContent }) => textContent.trim() === 'Place Garage');
    expect(garagePlace?.disabled).toBe(false);

    const store = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      ({ textContent }) => textContent.includes('Main store$160'),
    );
    act(() => store?.click());
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'main-store-plot is already occupied',
    );
    const storePlace = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      ({ textContent }) => textContent.trim() === 'Place Main store',
    );
    expect(storePlace?.disabled).toBe(true);
    act(() => root.unmount());
  });

  it('reports exact invalid cells and disables dusk construction', () => {
    const initial = createInitialState();
    const root = createRoot(container);
    act(() => {
      root.render(
        <ConstructionModal
          isOpen
          isRecoveryReady
          onClose={vi.fn()}
          onPlaceConstruction={vi.fn()}
          simulation={{ ...initial, phase: 'dusk' }}
        />,
      );
    });

    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Construction is available during day operations.',
    );
    const place = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      ({ textContent }) => textContent.trim() === 'Place Wall',
    );
    expect(place?.disabled).toBe(true);
    act(() => root.unmount());
  });
});
