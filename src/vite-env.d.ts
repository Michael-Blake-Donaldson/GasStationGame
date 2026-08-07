/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
