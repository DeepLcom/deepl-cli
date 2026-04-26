export type ValidationSeverity = 'pass' | 'warn' | 'error';

export interface ValidationIssue {
  check: string;
  severity: ValidationSeverity;
  message: string;
  details?: { expected?: string[]; actual?: string[] };
}

export interface ValidationResult {
  key: string;
  source: string;
  translation: string;
  severity: ValidationSeverity;
  issues: ValidationIssue[];
}

const PLACEHOLDER_RE = /\{\{[\p{L}\p{N}_]+\}\}|\$\{[\p{L}\p{N}_]+\}|\{[\p{L}\p{N}_]+\}|%\d+\$[sdfu@]|%[sdfu@]/gu;

function extractPlaceholders(text: string): string[] {
  return text.match(PLACEHOLDER_RE) ?? [];
}

function toFrequencyMap(items: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const item of items) {
    freq.set(item, (freq.get(item) ?? 0) + 1);
  }
  return freq;
}

function checkPlaceholders(source: string, translation: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sourcePlaceholders = extractPlaceholders(source);
  const translationPlaceholders = extractPlaceholders(translation);

  const sourceFreq = toFrequencyMap(sourcePlaceholders);
  const translFreq = toFrequencyMap(translationPlaceholders);

  const missing: string[] = [];
  const extra: string[] = [];

  for (const [ph, count] of sourceFreq) {
    const translCount = translFreq.get(ph) ?? 0;
    for (let i = 0; i < count - translCount; i++) missing.push(ph);
  }

  for (const [ph, count] of translFreq) {
    const srcCount = sourceFreq.get(ph) ?? 0;
    for (let i = 0; i < count - srcCount; i++) extra.push(ph);
  }

  if (missing.length > 0) {
    issues.push({
      check: 'placeholders',
      severity: 'error',
      message: `Missing placeholders in translation: ${missing.join(', ')}`,
      details: { expected: sourcePlaceholders, actual: translationPlaceholders },
    });
  }

  if (extra.length > 0) {
    issues.push({
      check: 'placeholders',
      severity: 'warn',
      message: `Extra placeholders in translation: ${extra.join(', ')}`,
      details: { expected: sourcePlaceholders, actual: translationPlaceholders },
    });
  }

  return issues;
}

interface BracketInfo {
  maxDepth: number;
  open: number;
  close: number;
}

function analyzeBrackets(text: string): BracketInfo {
  let depth = 0;
  let maxDepth = 0;
  let open = 0;
  let close = 0;
  for (const ch of text) {
    if (ch === '{') {
      open++;
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (ch === '}') {
      close++;
      depth--;
    }
  }
  return { maxDepth, open, close };
}

function hasIcuSyntax(text: string): boolean {
  return /\{\w+\s*,\s*(?:plural|select|selectordinal)\s*,/.test(text);
}

function checkIcuBrackets(source: string, translation: string): ValidationIssue[] {
  if (!hasIcuSyntax(source) && !hasIcuSyntax(translation)) {
    return [];
  }

  const sourceBrackets = analyzeBrackets(source);
  const translationBrackets = analyzeBrackets(translation);

  if (
    sourceBrackets.maxDepth !== translationBrackets.maxDepth ||
    sourceBrackets.open !== translationBrackets.open ||
    sourceBrackets.close !== translationBrackets.close
  ) {
    return [{
      check: 'icu-brackets',
      severity: 'error',
      message: `ICU bracket nesting depth mismatch: source=${sourceBrackets.maxDepth}, translation=${translationBrackets.maxDepth}`,
    }];
  }

  return [];
}

function extractHtmlTags(text: string): string[] {
  const matches: string[] = [];
  const pattern = /<\/?[\w-]+\s*\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

function checkHtmlTags(source: string, translation: string): ValidationIssue[] {
  const sourceTags = extractHtmlTags(source);
  const translationTags = extractHtmlTags(translation);

  if (sourceTags.length === 0) {
    return [];
  }

  const missing = sourceTags.filter(
    (t) => !translationTags.includes(t),
  );

  if (missing.length > 0) {
    return [{
      check: 'html-tags',
      severity: 'warn',
      message: `Missing HTML tags in translation: ${missing.join(', ')}`,
      details: { expected: sourceTags, actual: translationTags },
    }];
  }

  return [];
}

function checkUntranslated(source: string, translation: string): ValidationIssue[] {
  if (source.length < 2) return [];
  if (source === translation) {
    return [{
      check: 'untranslated',
      severity: 'warn',
      message: 'Translation is identical to source text',
    }];
  }
  return [];
}

function checkLengthRatio(source: string, translation: string): ValidationIssue[] {
  if (source.length < 10) return [];
  const ratio = translation.length / source.length;
  if (ratio > 1.5) {
    return [{
      check: 'length-ratio',
      severity: 'warn',
      message: `Translation is ${Math.round(ratio * 100)}% the length of source (threshold: 150%)`,
    }];
  }
  return [];
}

function worstSeverity(issues: ValidationIssue[]): ValidationSeverity {
  if (issues.some((i) => i.severity === 'error')) return 'error';
  if (issues.some((i) => i.severity === 'warn')) return 'warn';
  return 'pass';
}

export function validateTranslation(
  key: string,
  source: string,
  translation: string,
): ValidationResult {
  const issues: ValidationIssue[] = [
    ...checkPlaceholders(source, translation),
    ...checkIcuBrackets(source, translation),
    ...checkHtmlTags(source, translation),
    ...checkUntranslated(source, translation),
    ...checkLengthRatio(source, translation),
  ];

  return {
    key,
    source,
    translation,
    severity: worstSeverity(issues),
    issues,
  };
}

export function validateBatch(
  entries: Array<{ key: string; source: string; translation: string }>,
): ValidationResult[] {
  return entries.map((e) => validateTranslation(e.key, e.source, e.translation));
}
