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

  // Preserve various variable formats (order matters - longest match first)
  const patterns = [
    /\$\{[\p{L}\p{N}_]+\}/gu,       // ${name}, ${имя}
    /\{\{[\p{L}\p{N}_]+\}\}/gu,     // {{name}}, {{имя}} — must precede {name}
    /\{[\p{L}\p{N}_]+\}/gu,         // {name}, {名前}, {0}
    /%\d+\$[sdfu@]/g,               // %1$s, %2$d
    /%[sdfu@]/g,                     // %s, %d, %f, %u, %@
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
    while (restored.includes(placeholder)) {
      restored = restored.replace(placeholder, () => original);
    }
  }
  return restored;
}
