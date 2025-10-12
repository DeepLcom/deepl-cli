/**
 * Logger Utility
 * Centralized logging with quiet mode support
 */

class LoggerClass {
  private quiet: boolean = false;

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
   * Log informational messages (suppressed in quiet mode)
   */
  info(...args: any[]): void {
    if (!this.quiet) {
      console.log(...args);
    }
  }

  /**
   * Log success messages (suppressed in quiet mode)
   */
  success(...args: any[]): void {
    if (!this.quiet) {
      console.log(...args);
    }
  }

  /**
   * Log warning messages (suppressed in quiet mode)
   */
  warn(...args: any[]): void {
    if (!this.quiet) {
      console.error(...args);
    }
  }

  /**
   * Log error messages (ALWAYS shown, even in quiet mode)
   */
  error(...args: any[]): void {
    console.error(...args);
  }

  /**
   * Log essential output (ALWAYS shown, even in quiet mode)
   * Use this for translation results, command output, etc.
   */
  output(...args: any[]): void {
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
