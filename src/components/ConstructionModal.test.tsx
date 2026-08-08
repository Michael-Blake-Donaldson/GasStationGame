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

  it('explains gate passability before gate controls exist', () => {
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
    const gate = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      ({ textContent }) => textContent.includes('Gate$8'),
    );
    act(() => gate?.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'staff cannot pass through this footprint',
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'solid barrier',
    );
    act(() => root.unmount());
  });

  it('names the crew member stranded by a placement preview', () => {
    const initial = createInitialState();
    const simulation = {
      ...initial,
      nextConstructionSequence: 3,
      stationOccupancy: {
        ...initial.stationOccupancy,
        occupants: [
          ...initial.stationOccupancy.occupants,
          ...[
            { x: 19, z: 18 },
            { x: 20, z: 19 },
            { x: 21, z: 18 },
          ].map(({ x, z }, index) => ({
            footprint: { height: 1, width: 1 },
            id: `built-wall-${String(index)}`,
            origin: { x, z },
            placement: 'flexible' as const,
            rotation: 0 as const,
            structureId: 'wall',
          })),
        ].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
      },
    };
    const root = createRoot(container);
    act(() => {
      root.render(
        <ConstructionModal
          isOpen
          isRecoveryReady
          onClose={vi.fn()}
          onPlaceConstruction={vi.fn()}
          simulation={simulation}
        />,
      );
    });
    const [xInput, zInput] =
      document.querySelectorAll<HTMLInputElement>('input[type="number"]');
    if (xInput === undefined || zInput === undefined) {
      throw new Error('Construction coordinate controls are missing.');
    }
    const inputValueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    );
    if (inputValueDescriptor?.set === undefined) {
      throw new Error('Input value setter is missing.');
    }
    act(() => {
      inputValueDescriptor.set?.call(xInput, '20');
      xInput.dispatchEvent(new Event('input', { bubbles: true }));
      inputValueDescriptor.set?.call(zInput, '17');
      zInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Strands Cora from Checkout Counter',
    );
    const place = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      ({ textContent }) => textContent.trim() === 'Place Wall',
    );
    expect(place?.disabled).toBe(true);
    act(() => root.unmount());
  });
});
