import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type * as ThreeModule from 'three';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StationVisualState } from '../presentation/stationVisualState';
import { StationScene } from './StationScene';
import {
  createInitialState,
  dispatchSimulationCommand,
  greatPlainsSimulationContext,
} from '../scenarios/greatPlains';

interface RendererRecord {
  readonly dispose: () => void;
  readonly domElement: HTMLCanvasElement;
  readonly render: () => void;
}

const rendererRecords = vi.hoisted(() => [] as RendererRecord[]);

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof ThreeModule>();

  class MockWebGLRenderer {
    readonly dispose = vi.fn();
    readonly domElement = document.createElement('canvas');
    readonly render = vi.fn();
    readonly setPixelRatio = vi.fn();
    readonly setSize = vi.fn();
    readonly shadowMap: { enabled: boolean; type?: number } = { enabled: false };
    outputColorSpace = '';

    constructor() {
      rendererRecords.push(this);
    }
  }

  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

interface ObserverRecord {
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly observe: ReturnType<typeof vi.fn>;
}

const observerRecords: ObserverRecord[] = [];

class MockResizeObserver {
  readonly disconnect = vi.fn();
  readonly observe = vi.fn();

  constructor() {
    observerRecords.push(this);
  }
}

const visualState = (
  atmosphere: StationVisualState['atmosphere'],
  beaconStatus: StationVisualState['beaconStatus'],
): StationVisualState => ({ atmosphere, beaconStatus, phase: atmosphere });

describe('StationScene lifecycle', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    rendererRecords.length = 0;
    observerRecords.length = 0;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reuses one renderer across visual changes and disposes every owned resource', () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    const root = createRoot(container);
    const occupancy = createInitialState().stationOccupancy;
    const stationGrid = greatPlainsSimulationContext.scenario.stationGridDefinition;

    act(() => {
      root.render(
        <StationScene
          occupancy={occupancy}
          stationGrid={stationGrid}
          visualState={visualState('day', 'stable')}
        />,
      );
    });

    expect(rendererRecords).toHaveLength(1);
    expect(observerRecords).toHaveLength(1);
    const renderer = rendererRecords[0];
    const observer = observerRecords[0];
    if (renderer === undefined || observer === undefined) {
      throw new Error('Station scene did not create its rendering resources.');
    }
    expect(observer.observe).toHaveBeenCalledTimes(1);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBe(renderer.domElement);
    const initialRenderCount = vi.mocked(renderer.render).mock.calls.length;

    act(() => {
      root.render(
        <StationScene
          occupancy={occupancy}
          stationGrid={stationGrid}
          visualState={visualState('night', 'critical')}
        />,
      );
    });

    expect(rendererRecords).toHaveLength(1);
    expect(container.querySelector('canvas')).toBe(canvas);
    expect(vi.mocked(renderer.render).mock.calls.length).toBeGreaterThan(
      initialRenderCount,
    );
    expect(
      container.querySelector('.station-scene')?.getAttribute('data-beacon-status'),
    ).toBe('critical');

    act(() => root.unmount());

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('projects authoritative built occupants without recreating the renderer', () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    const root = createRoot(container);
    const initial = createInitialState();
    const stationGrid = greatPlainsSimulationContext.scenario.stationGridDefinition;
    act(() => {
      root.render(
        <StationScene
          occupancy={initial.stationOccupancy}
          stationGrid={stationGrid}
          visualState={visualState('day', 'stable')}
        />,
      );
    });
    expect(container.textContent).toContain('0 new construction shells');
    const built = dispatchSimulationCommand(initial, {
      atTick: 0,
      command: {
        blueprintId: 'wall',
        placement: { kind: 'flexible', origin: { x: 0, z: 4 }, rotation: 0 },
        type: 'construction.place',
      },
      id: 'scene-wall',
      sequence: 0,
    }).state;
    const renderer = rendererRecords[0];
    if (renderer === undefined) throw new Error('Renderer was not created.');
    const renderCount = vi.mocked(renderer.render).mock.calls.length;
    act(() => {
      root.render(
        <StationScene
          occupancy={built.stationOccupancy}
          stationGrid={stationGrid}
          visualState={visualState('day', 'stable')}
        />,
      );
    });
    expect(rendererRecords).toHaveLength(1);
    expect(container.textContent).toContain('1 new construction shells');
    expect(vi.mocked(renderer.render).mock.calls.length).toBeGreaterThan(renderCount);
    const geometryDisposalsBeforeReplacement = geometryDispose.mock.calls.length;
    const materialDisposalsBeforeReplacement = materialDispose.mock.calls.length;
    const extended = dispatchSimulationCommand(built, {
      atTick: 0,
      command: {
        blueprintId: 'wall',
        placement: { kind: 'flexible', origin: { x: 1, z: 4 }, rotation: 0 },
        type: 'construction.place',
      },
      id: 'scene-second-wall',
      sequence: 1,
    }).state;
    act(() => {
      root.render(
        <StationScene
          occupancy={extended.stationOccupancy}
          stationGrid={stationGrid}
          visualState={visualState('day', 'stable')}
        />,
      );
    });
    expect(container.textContent).toContain('2 new construction shells');
    expect(geometryDispose.mock.calls.length).toBe(
      geometryDisposalsBeforeReplacement + 1,
    );
    expect(materialDispose.mock.calls.length).toBe(
      materialDisposalsBeforeReplacement + 1,
    );
    act(() => root.unmount());
  });
});
