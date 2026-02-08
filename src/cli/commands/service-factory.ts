import type { DeepLClient } from '../../api/deepl-client.js';
import type { ConfigService } from '../../storage/config.js';
import type { CacheService } from '../../storage/cache.js';
import type { DeepLClientOptions } from '../../api/http-client.js';
import type { GlossaryCommand } from './glossary.js';
import type { AdminCommand } from './admin.js';
import type { WriteCommand } from './write.js';
import type { StyleRulesCommand } from './style-rules.js';
import type { UsageCommand } from './usage.js';
import type { TranslateCommand } from './translate.js';
import type { WatchCommand } from './watch.js';
import type { VoiceCommand } from './voice.js';

export type CreateDeepLClient = (overrideBaseUrl?: string) => Promise<DeepLClient>;
export type GetApiKeyAndOptions = () => { apiKey: string; options: DeepLClientOptions };

export interface ServiceDeps {
  createDeepLClient: CreateDeepLClient;
  getApiKeyAndOptions: GetApiKeyAndOptions;
  getConfigService: () => ConfigService;
  getCacheService: () => Promise<CacheService>;
  handleError: (error: unknown) => never;
}

export async function createGlossaryCommand(
  createDeepLClient: CreateDeepLClient,
): Promise<GlossaryCommand> {
  const client = await createDeepLClient();
  const { GlossaryService } = await import('../../services/glossary.js');
  const { GlossaryCommand: GlossaryCmd } = await import('./glossary.js');
  const glossaryService = new GlossaryService(client);
  return new GlossaryCmd(glossaryService);
}

export async function createAdminCommand(
  createDeepLClient: CreateDeepLClient,
): Promise<AdminCommand> {
  const client = await createDeepLClient();
  const { AdminCommand: AdminCmd } = await import('./admin.js');
  return new AdminCmd(client);
}

export async function createWriteCommand(
  deps: Pick<ServiceDeps, 'createDeepLClient' | 'getConfigService' | 'getCacheService'>,
): Promise<WriteCommand> {
  const client = await deps.createDeepLClient();
  const { WriteService } = await import('../../services/write.js');
  const { WriteCommand: WriteCmd } = await import('./write.js');
  const configService = deps.getConfigService();
  const writeService = new WriteService(client, configService, await deps.getCacheService());
  return new WriteCmd(writeService);
}

export async function createStyleRulesCommand(
  createDeepLClient: CreateDeepLClient,
): Promise<StyleRulesCommand> {
  const client = await createDeepLClient();
  const { StyleRulesCommand: StyleRulesCmd } = await import('./style-rules.js');
  return new StyleRulesCmd(client);
}

export async function createUsageCommand(
  createDeepLClient: CreateDeepLClient,
): Promise<UsageCommand> {
  const client = await createDeepLClient();
  const { UsageCommand: UsageCmd } = await import('./usage.js');
  return new UsageCmd(client);
}

export async function createTranslateCommand(
  deps: Pick<ServiceDeps, 'createDeepLClient' | 'getConfigService' | 'getCacheService'>,
  overrideBaseUrl?: string,
): Promise<TranslateCommand> {
  const client = await deps.createDeepLClient(overrideBaseUrl);
  const { TranslationService } = await import('../../services/translation.js');
  const { DocumentTranslationService } = await import('../../services/document-translation.js');
  const { GlossaryService } = await import('../../services/glossary.js');
  const { TranslateCommand: TranslateCmd } = await import('./translate.js');
  const configService = deps.getConfigService();
  const translationService = new TranslationService(client, configService, await deps.getCacheService());
  const documentTranslationService = new DocumentTranslationService(client);
  const glossaryService = new GlossaryService(client);
  return new TranslateCmd(translationService, documentTranslationService, glossaryService, configService);
}

export async function createWatchCommand(
  deps: Pick<ServiceDeps, 'createDeepLClient' | 'getConfigService' | 'getCacheService'>,
): Promise<WatchCommand> {
  const client = await deps.createDeepLClient();
  const { TranslationService } = await import('../../services/translation.js');
  const { GlossaryService } = await import('../../services/glossary.js');
  const { WatchCommand: WatchCmd } = await import('./watch.js');
  const translationService = new TranslationService(client, deps.getConfigService(), await deps.getCacheService());
  const glossaryService = new GlossaryService(client);
  return new WatchCmd(translationService, glossaryService);
}

export async function createVoiceCommand(
  getApiKeyAndOptions: GetApiKeyAndOptions,
): Promise<VoiceCommand> {
  const { apiKey, options } = getApiKeyAndOptions();
  if (options.baseUrl) {
    const { validateApiUrl } = await import('../../utils/validate-url.js');
    validateApiUrl(options.baseUrl);
  }
  const { VoiceClient } = await import('../../api/voice-client.js');
  const { VoiceService } = await import('../../services/voice.js');
  const { VoiceCommand: VoiceCmd } = await import('./voice.js');
  const voiceClient = new VoiceClient(apiKey, options);
  const voiceService = new VoiceService(voiceClient);
  return new VoiceCmd(voiceService);
}
