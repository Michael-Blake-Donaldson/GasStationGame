import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { loadEnv } from 'vite';

const buildEnvironment = loadEnv('production', process.cwd(), 'VITE_');
const configuredTitle = (
  process.env.VITE_GAME_TITLE ?? buildEnvironment.VITE_GAME_TITLE
)?.trim();
const playerFacingTitle =
  configuredTitle !== undefined && configuredTitle.length > 0
    ? configuredTitle
    : 'Last Stop';
const tauriConfig = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);
const configuredWindows = tauriConfig.app?.windows;

if (!Array.isArray(configuredWindows) || configuredWindows.length === 0) {
  throw new Error('Tauri must define at least one desktop window.');
}

const configOverride = JSON.stringify({
  productName: playerFacingTitle,
  app: {
    windows: configuredWindows.map((windowConfig) => ({
      ...windowConfig,
      title: playerFacingTitle,
    })),
  },
});
const bundleInstaller = process.argv.includes('--bundle');
const require = createRequire(import.meta.url);
const tauriCli = require.resolve('@tauri-apps/cli/tauri.js');
const tauriArguments = ['build'];

if (!bundleInstaller) {
  tauriArguments.push('--no-bundle');
}

tauriArguments.push('--config', configOverride);

try {
  const result = spawnSync(process.execPath, [tauriCli, ...tauriArguments], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Tauri build exited with code ${String(result.status)}.`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Desktop build failed: ${message}\n`);
  process.exitCode = 1;
}
