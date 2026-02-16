/**
 * Text preservation utilities
 * Preserves code blocks and variables during translation by replacing them with placeholders
 */

export function preserveCodeBlocks(text: string, preservationMap: Map<string, string>): string {
  let processed = text;
  let counter = 0;

  // Preserve multi-line code blocks (```)
  processed = processed.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_${counter++}__`;
    preservationMap.set(placeholder, match);
    return placeholder;
  });

  // Preserve inline code blocks (`)
  processed = processed.replace(/`[^`]+`/g, (match) => {
    const placeholder = `__CODE_${counter++}__`;
    preservationMap.set(placeholder, match);
    return placeholder;
  });

  return processed;
}

export function preserveVariables(text: string, preservationMap: Map<string, string>): string {
  let processed = text;
  let counter = 0;

  // Preserve various variable formats (order matters - do ${} before {})
  const patterns = [
    /\$\{[a-zA-Z0-9_]+\}/g,         // ${name}
    /\{[a-zA-Z0-9_]+\}/g,           // {name}, {0}
    /%[sd]/g,                        // %s, %d
  ];

  for (const pattern of patterns) {
    processed = processed.replace(pattern, (match) => {
      const placeholder = `__VAR_${counter++}__`;
      preservationMap.set(placeholder, match);
      return placeholder;
    });
  }

  return processed;
}

export function restorePlaceholders(text: string, preservationMap: Map<string, string>): string {
  let restored = text;
  for (const [placeholder, original] of preservationMap.entries()) {
    restored = restored.replace(placeholder, original);
  }
  return restored;
}
