import { StationScene } from '../game/rendering/StationScene';
import { readStationVisualFixture } from './stationVisualFixtureState';
import './stationVisualFixture.css';

export const StationVisualFixture = () => {
  const visualState = readStationVisualFixture(window.location.search);

  return (
    <main className="visual-fixture-page">
      <header className="visual-fixture-header">
        <div>
          <span className="panel-kicker">GS-018 deterministic visual fixture</span>
          <h1>Great Plains station</h1>
        </div>
        <dl>
          <div>
            <dt>Atmosphere</dt>
            <dd>{visualState.atmosphere}</dd>
          </div>
          <div>
            <dt>Beacon</dt>
            <dd>{visualState.beaconStatus}</dd>
          </div>
        </dl>
      </header>
      <section className="visual-fixture-scene">
        <StationScene visualState={visualState} />
      </section>
      <footer className="visual-fixture-footer">
        Development-only fixture. Query values: atmosphere=day|dusk|night and
        beacon=stable|critical|dark.
      </footer>
    </main>
  );
};
