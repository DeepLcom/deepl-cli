import type { DetectService, DetectResult } from '../../services/detect.js';

export type { DetectResult };

export class DetectCommand {
  private service: DetectService;

  constructor(service: DetectService) {
    this.service = service;
  }

  async detect(text: string): Promise<DetectResult> {
    return this.service.detect(text);
  }

  formatPlain(result: DetectResult): string {
    return `Detected language: ${result.languageName} (${result.detectedLanguage})`;
  }

  formatJson(result: DetectResult): string {
    return JSON.stringify({
      detected_language: result.detectedLanguage,
      language_name: result.languageName,
    }, null, 2);
  }
}
