import { StrictMode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { gameConfig } from './config/game';
import './styles.css';

const rootElement = document.querySelector<HTMLDivElement>('#root');

if (!rootElement) {
  throw new Error('Application root was not found.');
}

document.title = gameConfig.playerFacingTitle;

if (isTauri()) {
  void getCurrentWindow().setTitle(gameConfig.playerFacingTitle);
}

const root = createRoot(rootElement);
const isStationVisualFixture =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('visual-fixture') === 'station';

if (isStationVisualFixture) {
  const { StationVisualFixture } = await import('./dev/StationVisualFixture');
  root.render(
    <StrictMode>
      <StationVisualFixture />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
