import { useEffect, useMemo, useState } from 'react';
import { gameConfig } from './config/game';
import { greatPlainsRegion } from './content/regions/greatPlains';
import { StationScene } from './game/rendering/StationScene';
import { currentDayNumber } from './game/simulation/advanceSimulation';
import {
  dispatchSimulationCommand,
  type CommandReceipt,
} from './game/simulation/commands';
import { formatClock, wholeMinuteForClockUnit } from './game/simulation/clock';
import { createInitialState } from './game/simulation/createInitialState';
import {
  createFixedStepRunner,
  pumpSimulation,
  type FixedStepRunnerState,
} from './game/simulation/fixedStepRunner';
import {
  presentCommandReceipt,
  presentDomainEvent,
  selectRecentDomainEvents,
} from './game/presentation/domainEventPresentation';
import type { SimulationState, TimeMode } from './game/simulation/types';

const RESOURCE_LABELS = [
  ['cash', 'Cash', '$'],
  ['fuel', 'Fuel', ' gal'],
  ['ammunition', 'Ammo', ''],
  ['power', 'Power', '%'],
] as const;

const TIME_MODES: readonly TimeMode[] = ['paused', 'slow', 'normal', 'fast'];

const phaseLabel: Record<string, string> = {
  morning: 'Morning report',
  day: 'Day operations',
  dusk: 'Dusk readiness',
  night: 'Night command',
};

interface AppRuntime {
  readonly lastCommandReceipt: CommandReceipt | null;
  readonly nextCommandSequence: number;
  readonly runner: FixedStepRunnerState;
  readonly simulation: SimulationState;
}

export const App = () => {
  const [runtime, setRuntime] = useState<AppRuntime>(() => ({
    lastCommandReceipt: null,
    nextCommandSequence: 0,
    runner: createFixedStepRunner(),
    simulation: createInitialState(1987, gameConfig.verticalSliceNightCount),
  }));
  const simulation = runtime.simulation;

  useEffect(() => {
    let previousTimestamp = performance.now();

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        previousTimestamp = performance.now();
        setRuntime((current) => ({
          ...current,
          runner: createFixedStepRunner(),
        }));
        return;
      }

      const timestamp = performance.now();
      const elapsedMicroseconds = Math.max(
        0,
        Math.round((timestamp - previousTimestamp) * 1000),
      );
      previousTimestamp = timestamp;

      setRuntime((current) => {
        const result = pumpSimulation(
          current.simulation,
          current.runner,
          elapsedMicroseconds,
        );
        return {
          ...current,
          lastCommandReceipt:
            result.processedSteps > 0 ? null : current.lastCommandReceipt,
          runner: result.runner,
          simulation: result.simulation,
        };
      });
    }, 50);

    const resetAfterVisibilityChange = () => {
      previousTimestamp = performance.now();
      setRuntime((current) => ({
        ...current,
        runner: createFixedStepRunner(),
      }));
    };
    document.addEventListener('visibilitychange', resetAfterVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', resetAfterVisibilityChange);
    };
  }, []);

  const topEvent = selectRecentDomainEvents(simulation.eventLedger).at(-1);
  const latestPresentation =
    runtime.lastCommandReceipt === null
      ? topEvent === undefined
        ? null
        : presentDomainEvent(topEvent)
      : presentCommandReceipt(runtime.lastCommandReceipt);
  const beaconStatus =
    simulation.resources.power <= 0
      ? 'Dark'
      : simulation.resources.power <= 25
        ? 'Critical'
        : 'Stable';
  const nightDisplay = Math.min(
    simulation.completedNights + 1,
    gameConfig.verticalSliceNightCount,
  );
  const forecast = useMemo(
    () =>
      simulation.completedNights === 0
        ? 'Wind rising after sundown. Movement reported beyond the north fence.'
        : 'Signal confidence low. Protect overlapping light coverage.',
    [simulation.completedNights],
  );

  const chooseTimeMode = (mode: TimeMode) => {
    setRuntime((current) => {
      const sequence = current.nextCommandSequence;
      const result = dispatchSimulationCommand(current.simulation, {
        atTick: current.simulation.tick,
        command: { type: 'time-mode.set', mode },
        id: `ui-command-${String(sequence)}`,
        sequence,
      });
      return {
        ...current,
        lastCommandReceipt: result.receipt,
        nextCommandSequence: sequence + 1,
        simulation: result.state,
      };
    });
  };

  return (
    <main className={`app app--${simulation.phase}`}>
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">A retro supernatural management game</p>
          <h1>{gameConfig.playerFacingTitle}</h1>
          <span className="build-label">Great Plains systems prototype</span>
        </div>

        <section className="clock-panel" aria-label="Station time">
          <div>
            <span className="panel-kicker">Day {currentDayNumber(simulation)}</span>
            <strong>
              {formatClock(wholeMinuteForClockUnit(simulation.absoluteClockUnit))}
            </strong>
          </div>
          <div className="phase-chip" data-phase={simulation.phase}>
            {phaseLabel[simulation.phase]}
          </div>
          <div className="time-controls" aria-label="Time controls">
            {TIME_MODES.map((mode) => (
              <button
                className={simulation.timeMode === mode ? 'is-active' : ''}
                key={mode}
                onClick={() => chooseTimeMode(mode)}
                title={
                  simulation.phase === 'night' && mode === 'paused'
                    ? 'Night cannot fully pause'
                    : simulation.phase === 'night' && mode === 'fast'
                      ? 'Night caps fast mode at normal speed'
                      : mode
                }
                type="button"
              >
                {mode === 'paused'
                  ? 'Ⅱ'
                  : mode === 'slow'
                    ? '¼'
                    : mode === 'normal'
                      ? '▶'
                      : '▶▶'}
                <span className="sr-only">{mode}</span>
              </button>
            ))}
          </div>
        </section>
      </header>

      <section className="resource-strip" aria-label="Station resources">
        {RESOURCE_LABELS.map(([key, label, suffix]) => (
          <div className="resource" key={key}>
            <span>{label}</span>
            <strong>
              {suffix === '$' ? suffix : ''}
              {simulation.resources[key]}
              {suffix === '$' ? '' : suffix}
            </strong>
          </div>
        ))}
        <div className="beacon-state">
          <span className="status-lamp" data-status={beaconStatus.toLowerCase()} />
          <div>
            <span>Beacon</span>
            <strong>{beaconStatus}</strong>
          </div>
        </div>
      </section>

      <div className="workspace">
        <aside className="side-panel crew-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Shift board</span>
              <h2>Crew</h2>
            </div>
            <span className="count-badge">{simulation.employees.length}</span>
          </div>
          <div className="crew-list">
            {simulation.employees.map((employee) => (
              <article className="crew-card" key={employee.id}>
                <div className="avatar" aria-hidden="true">
                  {employee.name.at(0)}
                </div>
                <div className="crew-copy">
                  <strong>{employee.name}</strong>
                  <span>{employee.role}</span>
                </div>
                <div className="fatigue" title={`Fatigue ${String(employee.fatigue)}%`}>
                  <span style={{ width: `${String(employee.fatigue)}%` }} />
                </div>
              </article>
            ))}
          </div>
          <button className="outline-button" disabled type="button">
            Job assignment planned
          </button>
        </aside>

        <section className="world-panel">
          <StationScene isNight={simulation.phase === 'night'} />
          <div className="location-stamp">
            <span>Regional station 01</span>
            <strong>{greatPlainsRegion.displayName}</strong>
          </div>
          <div className="camera-help">World preview · Camera controls planned</div>
        </section>

        <aside className="side-panel intel-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Channel 03</span>
              <h2>Threat forecast</h2>
            </div>
            <span className="signal-bars" aria-label="Moderate signal confidence">
              ▂▅▇
            </span>
          </div>
          <div className="night-counter">
            <span>Scenario progress</span>
            <strong>
              Night {nightDisplay} / {gameConfig.verticalSliceNightCount}
            </strong>
          </div>
          <p className="forecast-copy">{forecast}</p>
          <div className="threat-tags">
            {greatPlainsRegion.startingThreats.slice(0, 2).map((threat) => (
              <span key={threat}>{threat}</span>
            ))}
          </div>
          <div className="grid-priority">
            <span>Planned grid allocation · preview</span>
            <div className="allocation-row">
              <span>Beacon</span>
              <div>
                <i style={{ width: '52%' }} />
              </div>
              <strong>52%</strong>
            </div>
            <div className="allocation-row">
              <span>Lights</span>
              <div>
                <i style={{ width: '28%' }} />
              </div>
              <strong>28%</strong>
            </div>
            <div className="allocation-row">
              <span>Garage</span>
              <div>
                <i style={{ width: '20%' }} />
              </div>
              <strong>20%</strong>
            </div>
          </div>
        </aside>
      </div>

      <footer className="event-console">
        <div className="event-icon">!</div>
        <div
          aria-atomic="true"
          aria-live="polite"
          data-tone={latestPresentation?.tone ?? 'neutral'}
          role="status"
        >
          <span className="panel-kicker">Latest station event</span>
          <strong>{latestPresentation?.message ?? 'No station events.'}</strong>
        </div>
        <span className="seed-label">Seed {simulation.seed}</span>
      </footer>
    </main>
  );
};
