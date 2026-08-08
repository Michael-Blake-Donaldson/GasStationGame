import { useMemo, useState } from 'react';
import { Modal } from './components/Modal';
import { OperationsModal } from './components/OperationsModal';
import { gameConfig } from './config/game';
import { greatPlainsRegion } from './content/regions/greatPlains';
import {
  presentCommandReceipt,
  presentDomainEvent,
  selectRecentDomainEvents,
} from './game/presentation/domainEventPresentation';
import {
  beaconVisualStatusLabel,
  selectStationVisualState,
} from './game/presentation/stationVisualState';
import { StationScene } from './game/rendering/StationScene';
import { useSimulationRuntime } from './game/runtime/useSimulationRuntime';
import { currentDayNumber } from './game/simulation/advanceSimulation';
import {
  formatClock,
  MINUTES_PER_DAY,
  wholeMinuteForClockUnit,
} from './game/simulation/clock';
import type { TimeMode } from './game/simulation/types';

const RESOURCE_LABELS = [
  ['cash', 'Cash', '$'],
  ['fuel', 'Fuel', ' gal'],
  ['food', 'Food', ' units'],
  ['ammunition', 'Ammo', ''],
  ['power', 'Power', '%'],
] as const;

const TIME_MODES: readonly TimeMode[] = ['paused', 'slow', 'normal', 'fast'];

const timeModeLabel: Record<TimeMode, string> = {
  paused: 'II',
  slow: '0.25x',
  normal: '1x',
  fast: '2x',
};

const phaseLabel: Record<string, string> = {
  morning: 'Morning report',
  day: 'Day operations',
  dusk: 'Dusk readiness',
  night: 'Night command',
};

export const App = () => {
  const [isGuideOpen, setGuideOpen] = useState(false);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isOperationsOpen, setOperationsOpen] = useState(false);
  const {
    assignJob,
    cancelJob,
    chooseTimeMode,
    isRecoveryReady,
    lastCommandReceipt,
    orderInventory,
    setRetailPrice,
    simulation,
  } = useSimulationRuntime({
    seed: 1987,
    targetNightCount: gameConfig.verticalSliceNightCount,
  });

  const topEvent = selectRecentDomainEvents(simulation.eventLedger).at(-1);
  const latestPresentation =
    lastCommandReceipt === null
      ? topEvent === undefined
        ? null
        : presentDomainEvent(topEvent)
      : presentCommandReceipt(lastCommandReceipt);
  const stationVisualState = selectStationVisualState(simulation);
  const beaconStatus = beaconVisualStatusLabel[stationVisualState.beaconStatus];
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

  return (
    <main className={`app app--${simulation.phase}`}>
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">A retro supernatural management game</p>
          <h1>{gameConfig.playerFacingTitle}</h1>
          <span className="build-label">Great Plains systems prototype</span>
        </div>

        <div className="topbar-actions">
          <section className="clock-panel" aria-label="Station time">
            <div className="clock-readout">
              <span className="panel-kicker">Day {currentDayNumber(simulation)}</span>
              <strong>
                {formatClock(wholeMinuteForClockUnit(simulation.absoluteClockUnit))}
              </strong>
            </div>
            <div className="phase-chip" data-phase={simulation.phase}>
              {phaseLabel[simulation.phase]}
            </div>
            <div className="time-controls" aria-label="Time controls" role="group">
              {TIME_MODES.map((mode) => (
                <button
                  aria-label={`${mode} time`}
                  aria-pressed={simulation.timeMode === mode}
                  className={simulation.timeMode === mode ? 'is-active' : ''}
                  disabled={!isRecoveryReady}
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
                  <span aria-hidden="true">{timeModeLabel[mode]}</span>
                </button>
              ))}
            </div>
          </section>
          <button
            className="guide-button"
            onClick={() => setGuideOpen(true)}
            type="button"
          >
            Station guide
          </button>
        </div>
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
                  <small>
                    {employee.activity.status === 'idle'
                      ? 'Available'
                      : `${employee.activity.status} / ${employee.activity.jobId.replaceAll('-', ' ')}`}
                  </small>
                </div>
                <div
                  aria-label={`${employee.name} fatigue`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={employee.fatigue}
                  className="fatigue"
                  role="meter"
                  title={`Fatigue ${String(employee.fatigue)}%`}
                >
                  <span style={{ width: `${String(employee.fatigue)}%` }} />
                </div>
              </article>
            ))}
          </div>
          <button
            className="outline-button"
            onClick={() => setOperationsOpen(true)}
            type="button"
          >
            Open shift board
          </button>
        </aside>

        <section className="world-panel">
          <StationScene visualState={stationVisualState} />
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
              <div
                aria-label="Beacon power allocation"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={52}
                role="meter"
              >
                <i style={{ width: '52%' }} />
              </div>
              <strong>52%</strong>
            </div>
            <div className="allocation-row">
              <span>Lights</span>
              <div
                aria-label="Lights power allocation"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={28}
                role="meter"
              >
                <i style={{ width: '28%' }} />
              </div>
              <strong>28%</strong>
            </div>
            <div className="allocation-row">
              <span>Garage</span>
              <div
                aria-label="Garage power allocation"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={20}
                role="meter"
              >
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
        <button
          className="event-history-button"
          onClick={() => setHistoryOpen(true)}
          type="button"
        >
          Event log
        </button>
        <span className="seed-label">Seed {simulation.seed}</span>
      </footer>

      <Modal
        eyebrow="Field manual / issue 01"
        isOpen={isGuideOpen}
        onClose={() => setGuideOpen(false)}
        title="Station guide"
      >
        <div className="guide-intro">
          <strong>Keep the station useful. Keep the beacon visible.</strong>
          <p>
            The Great Plains prototype currently demonstrates the station clock,
            deterministic simulation, routine customers, and station operations.
          </p>
        </div>
        <div className="guide-grid">
          <section>
            <span className="guide-number">01</span>
            <h3>Staff the shift</h3>
            <p>
              Assign one worker to pumps and another to checkout before opening time.
            </p>
          </section>
          <section>
            <span className="guide-number">02</span>
            <h3>Run retail</h3>
            <p>Set fuel and food prices, order stock, then watch queues and sales.</p>
          </section>
          <section>
            <span className="guide-number">03</span>
            <h3>Control the clock</h3>
            <p>Pause or change speed during the day. Night restricts unsafe modes.</p>
          </section>
        </div>
        <div className="guide-note">
          <span className="status-lamp" aria-hidden="true" />
          <p>
            Planned systems are labeled as previews until they are simulation-backed.
          </p>
        </div>
      </Modal>

      <OperationsModal
        isOpen={isOperationsOpen}
        isRecoveryReady={isRecoveryReady}
        onAssignJob={assignJob}
        onCancelJob={cancelJob}
        onClose={() => setOperationsOpen(false)}
        onOrderInventory={orderInventory}
        onSetRetailPrice={setRetailPrice}
        simulation={simulation}
      />

      <Modal
        eyebrow="Station record"
        isOpen={isHistoryOpen}
        onClose={() => setHistoryOpen(false)}
        title="Event log"
        variant="drawer"
      >
        <p className="event-history-intro">
          Recent simulation outcomes, newest first. Each entry comes from the
          authoritative station ledger.
        </p>
        <ol className="event-history-list">
          {[...selectRecentDomainEvents(simulation.eventLedger, 20)]
            .reverse()
            .map((event) => {
              const presentation = presentDomainEvent(event);
              return (
                <li data-tone={presentation.tone} key={event.sequence}>
                  <div className="event-history-meta">
                    <span>Event {event.sequence + 1}</span>
                    <time>
                      Day {Math.floor(event.minute / MINUTES_PER_DAY) + 1} /{' '}
                      {formatClock(event.minute)}
                    </time>
                  </div>
                  <p>{presentation.message}</p>
                </li>
              );
            })}
        </ol>
      </Modal>
    </main>
  );
};
