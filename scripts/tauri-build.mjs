import process from 'node:process';
import { run } from '@tauri-apps/cli';
import { loadEnv } from 'vite';

const buildEnvironment = loadEnv('production', process.cwd(), 'VITE_');
const configuredTitle = (
  process.env.VITE_GAME_TITLE ?? buildEnvironment.VITE_GAME_TITLE
)?.trim();
const playerFacingTitle =
  configuredTitle !== undefined && configuredTitle.length > 0
    ? configuredTitle
    : 'Last Stop';
const configOverride = JSON.stringify({ productName: playerFacingTitle });

try {
  await new Promise((resolve, reject) => {
    run(
      ['build', '--no-bundle', '--config', configOverride],
      'tauri',
      (error, success) => {
        if (error) {
          reject(error);
          return;
        }

        if (!success) {
          reject(new Error('Tauri build did not complete successfully.'));
          return;
        }

        resolve(undefined);
      },
    );
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Desktop build failed: ${message}\n`);
  process.exitCode = 1;
}
