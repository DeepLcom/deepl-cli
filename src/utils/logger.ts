/**
 * Logger Utility
 * Centralized logging with quiet mode support
 */

class LoggerClass {
  private quiet: boolean = false;
  private verboseMode: boolean = false;

  /**
   * Enable or disable quiet mode
   */
  setQuiet(enabled: boolean): void {
    this.quiet = enabled;
  }

  /**
   * Check if quiet mode is enabled
   */
  isQuiet(): boolean {
    return this.quiet;
  }

  /**
   * Enable or disable verbose mode
   */
  setVerbose(enabled: boolean): void {
    this.verboseMode = enabled;
  }

  /**
   * Check if verbose mode is enabled
   */
  isVerbose(): boolean {
    return this.verboseMode;
  }

  /**
   * Log verbose messages (only shown when verbose mode is enabled, suppressed in quiet mode)
   */
  verbose(...args: unknown[]): void {
    if (this.verboseMode && !this.quiet) {
      console.error(...args);
    }
  }

  /**
   * Log informational messages (suppressed in quiet mode)
   */
  info(...args: unknown[]): void {
    if (!this.quiet) {
      console.error(...args);
    }
  }

  /**
   * Log success messages (suppressed in quiet mode)
   */
  success(...args: unknown[]): void {
    if (!this.quiet) {
      console.error(...args);
    }
  }

  /**
   * Log warning messages (suppressed in quiet mode)
   */
  warn(...args: unknown[]): void {
    if (!this.quiet) {
      console.error(...args);
    }
  }

  /**
   * Log error messages (ALWAYS shown, even in quiet mode)
   */
  error(...args: unknown[]): void {
    console.error(...args);
  }

  /**
   * Log essential output (ALWAYS shown, even in quiet mode)
   * Use this for translation results, command output, etc.
   */
  output(...args: unknown[]): void {
    console.log(...args);
  }

  /**
   * Check if spinners should be shown
   * Returns false in quiet mode
   */
  shouldShowSpinner(): boolean {
    return !this.quiet;
  }
}

// Export singleton instance
export const Logger = new LoggerClass();
