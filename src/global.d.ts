import type { Config } from './config';

declare global {
  interface Window {
    ___config: Config['metabase'];
    tvinit: (options: { env: Config['metabase'] }) => void;
  }
}