import type { SyncFileResult, SyncResult } from './sync-service.js';

export interface FinalizeInputs {
  totalKeys: number;
  newKeys: number;
  staleKeys: number;
  deletedKeys: number;
  currentKeys: number;
  unwrittenKeys: number;
  totalCharsBilled: number;
  fileResults: SyncFileResult[];
  validationWarnings: number;
  validationErrors: number;
  estimatedCharacters: number;
  effectiveLocaleCount: number;
  dryRun: boolean;
  frozen: boolean;
  driftDetected: boolean;
  lockUpdated: boolean;
  allContextSentKeys: Set<string>;
  allInstructionSentKeys: Set<string>;
  allInstructionGroupTotals: Map<string, number>;
}

export function finalizeSyncResult(i: FinalizeInputs): SyncResult {
  const translatedKeys = i.newKeys + i.staleKeys;
  const contextCount = i.allContextSentKeys.size;
  const instructionCount = i.allInstructionSentKeys.size;
  const instructionBreakdown: Record<string, number> = {};
  for (const [elemType, count] of i.allInstructionGroupTotals) {
    instructionBreakdown[elemType] = count;
  }
  const hasStrategy = contextCount > 0 || instructionCount > 0;

  // docs/API.md defines exit 12 as a mixed result, so any failed key fails the
  // run: failed keys are absent from the written file, and gating on a locale
  // failing *entirely* would report success for a run that lost most of its
  // strings. A locale with no failures translated nothing because it is up to
  // date, which is still success.
  const anyKeyFailed = i.fileResults.some((fr) => fr.failed > 0);

  return {
    success: !i.driftDetected && !anyKeyFailed,
    totalKeys: i.totalKeys,
    newKeys: i.newKeys,
    staleKeys: i.staleKeys,
    deletedKeys: i.deletedKeys,
    currentKeys: i.currentKeys,
    unwrittenKeys: i.unwrittenKeys,
    totalCharactersBilled: i.totalCharsBilled,
    fileResults: i.fileResults,
    validationWarnings: i.validationWarnings,
    validationErrors: i.validationErrors,
    estimatedCharacters: i.estimatedCharacters,
    targetLocaleCount: i.effectiveLocaleCount,
    dryRun: i.dryRun,
    frozen: i.frozen,
    driftDetected: i.driftDetected,
    lockUpdated: i.lockUpdated,
    ...(hasStrategy && {
      strategy: {
        context: contextCount,
        instruction: instructionBreakdown,
        batch: Math.max(0, translatedKeys - contextCount - instructionCount),
      },
    }),
  };
}
