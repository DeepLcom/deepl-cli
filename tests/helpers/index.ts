export {
  makeRunCLI,
  makeNodeRunCLI,
  createTestConfigDir,
  createTestDir,
  type CLIRunOptions,
  type CLIErrorResult,
  type TestConfigDir,
} from './run-cli';

export {
  setupDeepLNock,
  mockTranslateResponse,
  mockTranslateError,
  mockUsageResponse,
  mockAuthError,
  mockLanguagesResponse,
  mockWriteResponse,
  DEEPL_FREE_API_URL,
  DEEPL_PRO_API_URL,
  TEST_API_KEY,
} from './nock-setup';

export {
  createMockDeepLClient,
  createMockConfigService,
  createMockCacheService,
  createMockTranslationService,
  createMockGlossaryService,
  createMockDocumentTranslationService,
  createMockFileTranslationService,
  createMockWatchService,
  createMockWriteService,
  createMockVoiceClient,
  createMockVoiceService,
  createMockAdminService,
  createMockUsageService,
  createMockStyleRulesService,
  createMockDetectService,
  createMockLanguagesService,
} from './mock-factories';
