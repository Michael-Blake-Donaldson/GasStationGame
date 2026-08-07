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

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
