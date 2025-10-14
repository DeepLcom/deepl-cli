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
- [Document Translation](./15-document-translation.sh) - Translating complete documents (PDF, DOCX, HTML, etc.) while preserving formatting
- [Document Format Conversion](./16-document-format-conversion.sh) - Converting document formats during translation
- [Custom Config Files](./17-custom-config-files.sh) - Using multiple configuration files for different projects
- [Cost Transparency](./18-cost-transparency.sh) - Tracking billed characters for translation cost analysis
- [XML Tag Handling](./19-xml-tag-handling.sh) - Advanced XML/HTML tag handling for fine-tuned translation control
- [Table Output Format](./20-table-output.sh) - Structured table output for comparing translations across multiple languages

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

### Running All Examples

You can run all examples at once using the `run-all.sh` script:

```bash
# Run all examples
./examples/run-all.sh

# Run all examples in fast mode (skip slow examples like watch mode)
./examples/run-all.sh --fast

# Stop on first failure
./examples/run-all.sh --stop-on-error

# Show help
./examples/run-all.sh --help
```

**Note:** Running all examples will make real API calls and consume your DeepL API quota.

## Example Files

The `sample-files/` directory contains sample documents used in the examples.

## Contributing Examples

Have a useful example? Please contribute! See [../CLAUDE.md](../CLAUDE.md) for guidelines.
