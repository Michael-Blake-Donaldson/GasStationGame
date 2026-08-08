import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { greatPlainsRegion } from '../content/regions/greatPlains';
import { createInitialState } from '../game/scenarios/greatPlains';
import { calculateServicePerformance } from '../game/simulation/employeePerformance';
import { OperationsModal } from './OperationsModal';

describe('OperationsModal performance inspection', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('shows exact authored skill, fatigue, duration, and error modifiers', () => {
    const root = createRoot(container);
    act(() => {
      root.render(
        <OperationsModal
          isOpen
          isRecoveryReady
          onAssignJob={vi.fn()}
          onCancelJob={vi.fn()}
          onClose={vi.fn()}
          onOrderInventory={vi.fn()}
          onSetRetailPrice={vi.fn()}
          simulation={createInitialState()}
        />,
      );
    });

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'checkout 4/5 · fatigue 14/100 · 40 base × 84.0% (20.0% skill reduction + 4.0% fatigue penalty) = 34 units · error 12.0% base − 8.0% skill + 1.5% fatigue = 5.5%',
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'pumps 4/5 · fatigue 21/100 · 80 base × 88.0% (20.0% skill reduction + 8.0% fatigue penalty) = 71 units · error 12.0% base − 8.0% skill + 3.0% fatigue = 7.0%',
    );
    expect(
      document
        .querySelector('button[aria-label="Assign Ada to checkout"]')
        ?.getAttribute('aria-describedby'),
    ).toBe('employee-ada-staff-checkout-performance');
    act(() => root.unmount());
  });

  it('exposes an active deterministic rework snapshot without relying on color', () => {
    const initial = createInitialState();
    const bo = initial.employees.find(({ id }) => id === 'employee-bo');
    expect(bo).toBeDefined();
    if (bo === undefined) return;
    const performance = calculateServicePerformance(
      bo,
      greatPlainsRegion.business.products.fuel,
      greatPlainsRegion.business.performanceRules,
      0,
      1,
    );
    const simulation = {
      ...initial,
      business: {
        ...initial.business,
        activeCustomers: [
          {
            arrivedAtClockUnit: initial.absoluteClockUnit,
            foodUnitsRequested: 0,
            fuelUnitsRequested: 6,
            id: 'routine-customer-0',
            revenue: 0,
            sequence: 0,
            stage: {
              performance,
              remainingClockUnits: performance.totalClockUnits,
              type: 'pump-service' as const,
              unitPrice: 4,
            },
          },
        ],
        nextCustomerSequence: 1,
      },
    };
    const root = createRoot(container);
    act(() => {
      root.render(
        <OperationsModal
          isOpen
          isRecoveryReady
          onAssignJob={vi.fn()}
          onCancelJob={vi.fn()}
          onClose={vi.fn()}
          onOrderInventory={vi.fn()}
          onSetRetailPrice={vi.fn()}
          simulation={simulation}
        />,
      );
    });

    const details = document.querySelector('[aria-label="Active service modifiers"]');
    expect(details?.textContent).toContain('Pump / Bo');
    expect(details?.textContent).toContain('pumps 4/5, fatigue 21/100');
    expect(details?.textContent).toContain('111/111 units. 80 base × 88.0%');
    expect(details?.textContent).toContain('Roll 0.0% against 7.0%');
    expect(details?.textContent).toContain('deterministic rework +40');
    act(() => root.unmount());
  });
});
