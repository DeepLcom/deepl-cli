# Troubleshooting Guide

Common issues and solutions when using the DeepL CLI.

## Authentication Errors (Exit Code 2)

### "Authentication failed: Invalid API key"

**Cause:** The API key is missing, invalid, or expired.

**Solutions:**

1. Verify your key is set:
   ```bash
   deepl auth show
   ```

2. Set or update your key:
   ```bash
   deepl auth set-key YOUR_API_KEY
   ```

3. Alternatively, use the environment variable:
   ```bash
   export DEEPL_API_KEY="your-key-here"
   ```

4. Verify the key works:
   ```bash
   deepl auth verify
   ```

**Notes:**
- Free API keys end with `:fx`. Pro keys do not.
- The CLI auto-detects the API tier (Free vs Pro) from the key suffix.
- Environment variable `DEEPL_API_KEY` takes precedence over the stored config key.

---

## Quota Errors (Exit Code 4)

### "Quota exceeded: Character limit reached"

**Cause:** Your DeepL account has reached its character translation limit.

**Solutions:**

1. Check your current usage:
   ```bash
   deepl usage
   ```

2. For detailed breakdown:
   ```bash
   deepl usage --format json
   ```

3. Wait for your quota to reset (monthly for most plans), or upgrade your DeepL plan.

---

## Rate Limiting (Exit Code 3)

### "Rate limit exceeded: Too many requests"

**Cause:** Too many API requests in a short time period.

**Solutions:**

1. The CLI automatically retries rate-limited requests with exponential backoff. If you still see this error, reduce concurrency.

2. For batch/directory translation, the CLI uses concurrency control internally. Avoid running multiple CLI instances simultaneously on the same API key.

3. Configure retry behavior:
   ```bash
   deepl config set retry.maxRetries 5
   deepl config set retry.timeout 60000
   ```

---

## Network Errors (Exit Code 5)

### "Network error: timeout" or "ECONNREFUSED"

**Cause:** Cannot reach the DeepL API servers.

**Solutions:**

1. Check your internet connection.

2. Verify DeepL API is reachable:
   ```bash
   curl -s https://api-free.deepl.com/v2/languages -H "Authorization: DeepL-Auth-Key YOUR_KEY"
   ```

3. If behind a corporate proxy, configure the proxy:
   ```bash
   deepl config set proxy.url http://proxy.example.com:8080
   ```

4. The CLI retries on transient network errors automatically with exponential backoff.

---

## Voice API Errors (Exit Code 9)

### "Voice API access denied"

**Cause:** Voice API requires a DeepL Pro account with Voice API access enabled.

**Solutions:**

1. Verify your account has Voice API access on the DeepL website.
2. Voice API always uses the Pro endpoint (`api.deepl.com`), even with free keys.
3. Check that your audio file format is supported (OGG, WebM, FLAC, MP3, PCM).

### "Invalid streaming URL"

**Cause:** The WebSocket URL returned by the API failed validation.

**Notes:**
- The CLI validates that streaming URLs use `wss://` scheme and `*.deepl.com` hostnames.
- This is a security check to prevent connection to unauthorized servers.
- If you see this error, it may indicate an API issue. Try again later.

### Audio format issues

If the CLI cannot auto-detect your audio format from the file extension, specify it explicitly:

```bash
deepl voice audio.raw --to de --content-type 'audio/pcm;encoding=s16le;rate=16000'
```

Supported formats: `audio/ogg`, `audio/webm`, `audio/flac`, `audio/mpeg`, `audio/x-matroska`, and PCM variants.

---

## Configuration Errors (Exit Code 7)

### "Configuration error: invalid config file"

**Cause:** The config file at `~/.deepl-cli/config.json` is corrupted or has invalid JSON.

**Solutions:**

1. View current config:
   ```bash
   deepl config show
   ```

2. Reset a specific setting:
   ```bash
   deepl config set <key> <value>
   ```

3. If the config file is corrupted, remove it and reconfigure:
   ```bash
   rm ~/.deepl-cli/config.json
   deepl auth set-key YOUR_API_KEY
   ```

4. Use a custom config directory:
   ```bash
   export DEEPL_CONFIG_DIR=/path/to/config
   ```

---

## Input Validation Errors (Exit Code 6)

### "Missing required argument"

Common causes and fixes:

- **translate**: Requires text or file path and `--to` language:
  ```bash
  deepl translate "Hello" --to es
  ```

- **watch**: Requires a path and `--targets`:
  ```bash
  deepl watch ./docs --targets es,fr
  ```

- **completion**: Requires a shell name:
  ```bash
  deepl completion bash
  ```

### "Unsupported language"

Use `deepl languages` to see all supported languages:
```bash
deepl languages --type source
deepl languages --type target
```

---

## Cache Issues

### Stale translations

If you suspect cached translations are outdated:

```bash
# Clear the cache
deepl cache clear

# Check cache status
deepl cache stats
```

### Cache database errors

If the SQLite cache becomes corrupted:

```bash
# Disable cache temporarily
deepl cache disable

# Remove the cache file and re-enable
rm ~/.deepl-cli/cache.db
deepl cache enable
```

---

## Document Translation Issues

### "Output directory is required for batch translation"

When translating a directory, you must specify `--output`:

```bash
deepl translate ./docs --to es --output ./docs-es
```

### Unsupported document format

Supported document formats: PDF, DOCX, PPTX, XLSX, HTML.

```bash
deepl translate document.docx --to fr --output translated.docx
```

---

## Glossary Issues

### "Glossary not found"

1. List available glossaries:
   ```bash
   deepl glossary list
   ```

2. Glossary names are case-sensitive. Use the exact name or ID.

3. Glossaries are tied to specific language pairs. Ensure your source/target language matches the glossary's language pair.

---

## Exit Codes Reference

| Code | Meaning | Retryable? |
|------|---------|------------|
| 0 | Success | N/A |
| 1 | General error | No |
| 2 | Authentication error | No |
| 3 | Rate limit exceeded | Yes |
| 4 | Quota exceeded | No |
| 5 | Network error | Yes |
| 6 | Invalid input | No |
| 7 | Configuration error | No |
| 8 | Check found issues (write --check) | No |
| 9 | Voice API error | Depends |

Use exit codes in scripts for retry logic:

```bash
deepl translate "Hello" --to es
case $? in
  0) echo "Success" ;;
  3|5) echo "Transient error, retrying..." ;;
  2) echo "Fix your API key" ;;
  4) echo "Quota exceeded, wait for reset" ;;
  *) echo "Error, check output" ;;
esac
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DEEPL_API_KEY` | API key (overrides stored config) |
| `DEEPL_CONFIG_DIR` | Custom config directory (default: `~/.deepl-cli`) |
| `NO_COLOR` | Disable colored output when set to any value |

---

## Getting More Help

```bash
# General help
deepl --help

# Command-specific help
deepl translate --help
deepl voice --help
deepl glossary --help

# Check CLI version
deepl --version
```

If you encounter an issue not covered here, check the [DeepL API documentation](https://www.deepl.com/docs-api) or file an issue on the project repository.
