# DeepL CLI Examples

This directory contains practical, real-world examples of using the DeepL CLI.

## Quick Links

- [Basic Translation](./01-basic-translation.sh) - Simple text translation examples
- [File Translation](./02-file-translation.sh) - Translating files and documents
- [Glossaries](./03-glossaries.sh) - Managing glossaries for consistent terminology
- [Configuration](./04-configuration.sh) - Setting up and managing configuration
- [Cache Management](./05-cache.sh) - Working with the translation cache
- [CI/CD Integration](./06-cicd-integration.sh) - Using DeepL CLI in automated workflows
- [Batch Processing](./07-batch-processing.sh) - Translating multiple files
- [Context-Aware Translation](./08-context-aware-translation.sh) - Using context for better translation quality
- [Writing Enhancement](./09-write-basic.sh) - Using DeepL Write API for grammar and style improvement
- [Usage Monitoring](./10-usage-monitoring.sh) - Monitoring API character usage and quota
- [Supported Languages](./11-languages.sh) - Listing source and target languages supported by DeepL
- [Model Type Selection](./12-model-type-selection.sh) - Choosing quality vs. speed trade-offs
- [Watch Mode](./13-watch-mode.sh) - Real-time file monitoring and auto-translation
- [Git Hooks Integration](./14-git-hooks.sh) - Automating translation validation in git workflow

## Prerequisites

All examples assume you have:

1. Installed DeepL CLI (`npm install -g deepl-cli` or `npm link`)
2. A DeepL API key configured (`deepl auth set-key YOUR_API_KEY`)

## Running Examples

Each example is a standalone bash script that you can run directly:

```bash
# Make executable
chmod +x examples/*.sh

# Run an example
./examples/01-basic-translation.sh
```

Or follow along and run commands individually.

## Example Files

The `sample-files/` directory contains sample documents used in the examples.

## Contributing Examples

Have a useful example? Please contribute! See [../CLAUDE.md](../CLAUDE.md) for guidelines.
