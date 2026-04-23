import { createRequire } from 'node:module';

export const requireModule: NodeRequire = createRequire(import.meta.url);
