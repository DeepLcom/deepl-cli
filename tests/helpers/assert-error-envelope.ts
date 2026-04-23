/**
 * Test helper: validates the JSON error envelope emitted on stderr by
 * `deepl sync <subcommand> --format json` when a command fails.
 *
 * The envelope shape is shared by every subcommand (push/pull/resolve/export/
 * validate/audit/init/status/sync) and is the machine-readable
 * contract script consumers rely on. This helper uses AJV to enforce the
 * shape; any drift breaks the test instead of silently shipping a bad payload.
 */

import Ajv, { type JSONSchemaType } from 'ajv';

export interface SyncJsonErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    suggestion?: string;
  };
  exitCode: number;
}

export const ERROR_ENVELOPE_SCHEMA: JSONSchemaType<SyncJsonErrorEnvelope> = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'error', 'exitCode'],
  properties: {
    ok: { type: 'boolean', const: false },
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', minLength: 1 },
        message: { type: 'string', minLength: 1 },
        suggestion: { type: 'string', minLength: 1, nullable: true },
      },
    },
    exitCode: { type: 'integer', minimum: 1 },
  },
};

export interface SyncInitJsonSuccessEnvelope {
  ok: true;
  created: {
    configPath: string;
    sourceLocale: string;
    targetLocales: string[];
    keys?: number;
  };
}

export const INIT_SUCCESS_ENVELOPE_SCHEMA: JSONSchemaType<SyncInitJsonSuccessEnvelope> = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'created'],
  properties: {
    ok: { type: 'boolean', const: true },
    created: {
      type: 'object',
      additionalProperties: false,
      required: ['configPath', 'sourceLocale', 'targetLocales'],
      properties: {
        configPath: { type: 'string', minLength: 1 },
        sourceLocale: { type: 'string', minLength: 1 },
        targetLocales: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
        },
        keys: { type: 'integer', minimum: 0, nullable: true },
      },
    },
  },
};

// AJV v8 default export is a class under the CJS type shim; treat both shapes
// so jest-via-ts-jest and runtime both resolve. In practice ts-jest sees the
// CJS shim while runtime sees the ESM re-export.
const AjvCtor: typeof Ajv =
  (Ajv as unknown as { default?: typeof Ajv }).default ?? Ajv;

const ajv = new AjvCtor({ strict: false, allErrors: true });
const validateError = ajv.compile(ERROR_ENVELOPE_SCHEMA);
const validateInitSuccess = ajv.compile(INIT_SUCCESS_ENVELOPE_SCHEMA);

/**
 * Extract the last JSON object from `stderr` and assert it matches the
 * error envelope schema. Parent-process progress lines (e.g. "Detecting
 * i18n files...") can land on stderr before the envelope, so we match the
 * final `{...}` block rather than parsing all of stderr.
 */
export function assertErrorEnvelope(
  stderr: string,
  expectedCode: string,
  expectedExitCode: number,
): SyncJsonErrorEnvelope {
  const match = stderr.trim().match(/\{[\s\S]*\}\s*$/);
  if (!match) {
    throw new Error(
      `No trailing JSON object found in stderr. stderr was:\n${stderr}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(
      `stderr trailing JSON is not parseable: ${(err as Error).message}\nPayload: ${match[0]}`,
      { cause: err },
    );
  }

  if (!validateError(parsed)) {
    throw new Error(
      `Envelope failed AJV validation:\n${ajv.errorsText(validateError.errors)}\nPayload: ${JSON.stringify(parsed)}`,
    );
  }

  if (parsed.error.code !== expectedCode) {
    throw new Error(
      `Envelope error.code = "${parsed.error.code}", expected "${expectedCode}". Payload: ${JSON.stringify(parsed)}`,
    );
  }
  if (parsed.exitCode !== expectedExitCode) {
    throw new Error(
      `Envelope exitCode = ${parsed.exitCode}, expected ${expectedExitCode}. Payload: ${JSON.stringify(parsed)}`,
    );
  }
  return parsed;
}

/**
 * Validate an `init --format json` success envelope on stdout. Separate from
 * the error envelope because `init` is the only subcommand with a dedicated
 * machine-readable success payload today.
 */
export function assertInitSuccessEnvelope(stdout: string): SyncInitJsonSuccessEnvelope {
  const match = stdout.trim().match(/\{[\s\S]*\}\s*$/);
  if (!match) {
    throw new Error(
      `No trailing JSON object found in stdout. stdout was:\n${stdout}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(
      `stdout trailing JSON is not parseable: ${(err as Error).message}\nPayload: ${match[0]}`,
      { cause: err },
    );
  }

  if (!validateInitSuccess(parsed)) {
    throw new Error(
      `Init success envelope failed AJV validation:\n${ajv.errorsText(validateInitSuccess.errors)}\nPayload: ${JSON.stringify(parsed)}`,
    );
  }
  return parsed;
}
