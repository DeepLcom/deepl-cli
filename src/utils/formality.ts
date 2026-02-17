const TEXT_FORMALITY_MAP: Record<string, string> = {
  formal: 'more',
  informal: 'less',
};

const VOICE_FORMALITY_MAP: Record<string, string> = {
  prefer_more: 'formal',
  prefer_less: 'informal',
};

export function normalizeFormality(value: string, api: 'text' | 'voice'): string {
  const map = api === 'text' ? TEXT_FORMALITY_MAP : VOICE_FORMALITY_MAP;
  return map[value] ?? value;
}
