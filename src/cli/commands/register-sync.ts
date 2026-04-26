import type { Command } from 'commander';
import type { ServiceDeps } from './service-factory.js';
import { registerSyncRoot } from './sync/register-sync-root.js';
import { registerSyncInit } from './sync/register-sync-init.js';
import { registerSyncStatus } from './sync/register-sync-status.js';
import { registerSyncValidate } from './sync/register-sync-validate.js';
import { registerSyncAudit } from './sync/register-sync-audit.js';
import { registerSyncExport } from './sync/register-sync-export.js';
import { registerSyncResolve } from './sync/register-sync-resolve.js';
import { registerSyncPush } from './sync/register-sync-push.js';
import { registerSyncPull } from './sync/register-sync-pull.js';

export function registerSync(program: Command, deps: ServiceDeps): void {
  const syncCmd = registerSyncRoot(program, deps);

  registerSyncInit(syncCmd, deps);
  registerSyncStatus(syncCmd, deps);
  registerSyncValidate(syncCmd, deps);
  registerSyncAudit(syncCmd, deps);
  registerSyncExport(syncCmd, deps);
  registerSyncResolve(syncCmd, deps);
  registerSyncPush(syncCmd, deps);
  registerSyncPull(syncCmd, deps);
}
