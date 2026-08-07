import { useEffect, useMemo, useState } from 'react';
import { gameConfig } from './config/game';
import { greatPlainsRegion } from './content/regions/greatPlains';
import { StationScene } from './game/rendering/StationScene';
import {
  advanceSimulation,
  currentDayNumber,
  withTimeMode,
} from './game/simulation/advanceSimulation';
import { formatClock } from './game/simulation/clock';
import { createInitialState } from './game/simulation/createInitialState';
import type { TimeMode } from './game/simulation/types';

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

export const App = () => {
  const [simulation, setSimulation] = useState(createInitialState);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSimulation((current) => advanceSimulation(current, 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const topEvent = simulation.events.at(-1);
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
    setSimulation((current) => withTimeMode(current, mode));
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
            <strong>{formatClock(simulation.absoluteMinute)}</strong>
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
        <div>
          <span className="panel-kicker">Latest station event</span>
          <strong>{topEvent?.message ?? 'No station events.'}</strong>
        </div>
        <span className="seed-label">Seed {simulation.seed}</span>
      </footer>
    </main>
  );
};
