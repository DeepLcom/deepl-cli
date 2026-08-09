/**
 * Logger Utility
 * Centralized logging with quiet mode support
 */

import { neutralizeTerminalControls } from './control-chars.js';

/**
 * Shortest credential value redacted by literal substring match. A DeepL key is
 * UUID-shaped and TMS credentials are longer still, so nothing real is below
 * this; anything shorter would corrupt ordinary prose instead, because the match
 * has no token boundary.
 */
const MIN_REDACTABLE_SECRET_LENGTH = 8;

class LoggerClass {
  private quiet: boolean = false;
  private verboseMode: boolean = false;
  private readonly registeredSecrets = new Set<string>();

  /**
   * Register a credential the redactor cannot find in the environment: an API
   * key read from config.json, or TMS credentials inlined in .deepl-sync.yaml.
   * A config-file key takes precedence over DEEPL_API_KEY, so without this the
   * credential actually on the wire is the one value the redactor cannot see.
   */
  registerSecret(value: string | undefined): void {
    if (value) this.registeredSecrets.add(value);
  }

  /**
   * Forget every credential passed to `registerSecret`.
   */
  clearSecrets(): void {
    this.registeredSecrets.clear();
  }

  setQuiet(enabled: boolean): void {
    this.quiet = enabled;
  }

  isQuiet(): boolean {
    return this.quiet;
  }

  setVerbose(enabled: boolean): void {
    this.verboseMode = enabled;
  }

  isVerbose(): boolean {
    return this.verboseMode;
  }

  private sanitize(value: unknown): unknown {
    return this.mapStrings(value, new WeakSet(), (text) =>
      this.sanitizeString(text)
    );
  }

  private neutralize(value: unknown): unknown {
    return this.mapStrings(value, new WeakSet(), neutralizeTerminalControls);
  }

  /**
   * Recursively apply `transform` to every string reachable from `value` so a
   * dumped axios error (config.headers.Authorization etc.) cannot leak
   * credentials via util.inspect.
   */
  private mapStrings(
    value: unknown,
    seen: WeakSet<object>,
    transform: (text: string) => string
  ): unknown {
    if (typeof value === 'string') return transform(value);
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => this.mapStrings(item, seen, transform));
    }

    if (value instanceof Map) {
      return new Map(
        Array.from(value, ([key, entry]) => [
          this.mapStrings(key, seen, transform),
          this.mapStrings(entry, seen, transform),
        ])
      );
    }

    if (value instanceof Set) {
      return new Set(
        Array.from(value, (entry) => this.mapStrings(entry, seen, transform))
      );
    }

    // Values whose payload does not live in string-keyed own properties: a
    // rebuilt copy would either lose it (Date, RegExp) or enumerate every byte
    // (Buffer and the other views over an ArrayBuffer). None of them renders a
    // credential as readable text, so they are returned as they are.
    if (
      value instanceof Date ||
      value instanceof RegExp ||
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value)
    ) {
      return value;
    }

    if (value instanceof Error) {
      const copy = Object.create(
        Object.getPrototypeOf(value) as object
      ) as object;
      for (const key of Object.getOwnPropertyNames(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor) continue;
        // Accessor properties (V8 materializes `stack` lazily via a getter)
        // are flattened to their current value so the copy stays self-contained.
        const raw =
          'value' in descriptor
            ? descriptor.value
            : (value as unknown as Record<string, unknown>)[key];
        Object.defineProperty(copy, key, {
          value: this.mapStrings(raw, seen, transform),
          writable: true,
          configurable: true,
          enumerable: descriptor.enumerable,
        });
      }
      return copy;
    }

    // Every remaining object — a plain one, an axios AxiosHeaders, a
    // ClientRequest — is rebuilt property by property on its own prototype, so
    // util.inspect still names the class but never sees the live original.
    // Properties are defined rather than assigned so a key named `__proto__`
    // becomes an own property of the copy instead of reaching the setter.
    const copy = Object.create(
      Object.getPrototypeOf(value) as object | null
    ) as object;
    for (const [key, entry] of Object.entries(value)) {
      Object.defineProperty(copy, key, {
        value: this.mapStrings(entry, seen, transform),
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    return copy;
  }

  /**
   * Credential values long enough to redact by literal match — the environment
   * ones plus whatever the CLI registered from a config file. The header and
   * query-parameter patterns above cover the shapes a credential is normally
   * printed in; this is the backstop for a key echoed somewhere they do not
   * reach, such as a server's own error message.
   */
  private literalSecrets(): string[] {
    return [
      process.env['DEEPL_API_KEY'],
      process.env['TMS_API_KEY'],
      process.env['TMS_TOKEN'],
      ...this.registeredSecrets,
    ].filter(
      (secret): secret is string =>
        secret !== undefined && secret.length >= MIN_REDACTABLE_SECRET_LENGTH
    );
  }

  private sanitizeString(value: string): string {
    let result = value;
    result = result.replace(/([?&])token=[^&\s]*/gi, '$1token=[REDACTED]');
    result = result.replace(
      /([?&])api[_-]?key=[^&\s]*/gi,
      '$1api_key=[REDACTED]'
    );
    result = result.replace(
      /DeepL-Auth-Key\s+\S+/gi,
      'DeepL-Auth-Key [REDACTED]'
    );
    result = result.replace(
      /Authorization:\s+(ApiKey|Bearer)\s+\S+/gi,
      'Authorization: $1 [REDACTED]'
    );
    // X-Api-Key / X-Auth-Token — common in REST APIs and present on
    // TMS-style backends. axios error dumps frequently include the full
    // `config.headers` object, so these need explicit coverage.
    result = result.replace(/X-Api-Key:\s+\S+/gi, 'X-Api-Key: [REDACTED]');
    result = result.replace(
      /X-Auth-Token:\s+\S+/gi,
      'X-Auth-Token: [REDACTED]'
    );
    for (const secret of this.literalSecrets()) {
      result = result.replaceAll(secret, '[REDACTED]');
    }
    // Everything routed here goes to stderr, which is diagnostics rather than
    // data: no caller consumes it as bytes, and a non-TTY stderr is still
    // routinely rendered by an ANSI-interpreting CI log viewer, so control
    // sequences are neutralized unconditionally.
    return neutralizeTerminalControls(result);
  }

  /**
   * Log verbose messages (only shown when verbose mode is enabled, suppressed in quiet mode)
   */
  verbose(...args: unknown[]): void {
    if (this.verboseMode && !this.quiet) {
      console.error(...args.map((arg) => this.sanitize(arg)));
    }
  }

  /**
   * Log informational messages (suppressed in quiet mode)
   */
  info(...args: unknown[]): void {
    if (!this.quiet) {
      console.error(...args.map((arg) => this.sanitize(arg)));
    }
  }

  /**
   * Log success messages (suppressed in quiet mode)
   */
  success(...args: unknown[]): void {
    if (!this.quiet) {
      console.error(...args.map((arg) => this.sanitize(arg)));
    }
  }

  /**
   * Log warning messages (suppressed in quiet mode)
   */
  warn(...args: unknown[]): void {
    if (!this.quiet) {
      console.error(...args.map((arg) => this.sanitize(arg)));
    }
  }

  /**
   * Log error messages (ALWAYS shown, even in quiet mode)
   */
  error(...args: unknown[]): void {
    console.error(...args.map((arg) => this.sanitize(arg)));
  }

  /**
   * Log essential output (ALWAYS shown, even in quiet mode)
   * Use this for translation results, command output, etc.
   *
   * Terminal control sequences are neutralized only when stdout is a TTY:
   * redirected stdout is data — `deepl translate ... > out.txt` and command
   * substitution must reproduce the translation byte for byte. Untrusted values
   * interpolated into report lines are sanitized at their call site instead, so
   * those stay safe whether or not stdout is a terminal.
   */
  output(...args: unknown[]): void {
    if (process.stdout.isTTY) {
      console.log(...args.map((arg) => this.neutralize(arg)));
      return;
    }
    console.log(...args);
  }

  /**
   * Check if spinners should be shown.
   * Returns false in quiet mode or when stderr is not a TTY — ora writes to
   * stderr by default, so a non-TTY stderr means spinners would either no-op
   * inside ora or leak ANSI escapes into CI logs. Gating at this single
   * chokepoint covers every `ora(...)` callsite.
   */
  shouldShowSpinner(): boolean {
    return !this.quiet && !!process.stderr.isTTY;
  }
}

export const Logger = new LoggerClass();
