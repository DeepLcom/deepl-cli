# Free Key Endpoint Resolution - Findings & Plan

## Problem Statement

The CLI does not support free API keys (`:fx` suffix) correctly. Endpoint selection is driven entirely by persisted config values (`api.baseUrl` and `api.usePro`), which default to the pro endpoint. There is no runtime inspection of the API key suffix. A user with a free key who has never customized their config will send requests to `api.deepl.com`, which will reject the key with a 403.

The docs (`docs/API.md:2266`, `docs/TROUBLESHOOTING.md:36-37`) already claim auto-detection from `:fx` suffix exists, but this behavior is not implemented.

## Current Architecture

### Endpoint selection chokepoint

All endpoint resolution flows through a single line:

```
src/api/http-client.ts:102
  const baseURL = options.baseUrl ?? (options.usePro ? PRO_API_URL : FREE_API_URL);
```

Priority today:

1. `options.baseUrl` (from config or `--api-url` flag) — wins if set
2. `options.usePro` — selects between pro and free
3. Default — free (when `usePro` is falsy)

### Config defaults

```
src/storage/config.ts:172-173
  baseUrl: 'https://api.deepl.com'
  usePro: true
```

Because the default config persists `api.deepl.com` and `usePro: true`, a free key will always be routed to the pro endpoint unless the user manually reconfigures.

### Client construction sites (production)

| Site                      | File:Line                        | How options are built                                                 |
| ------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `createDeepLClient`       | `src/cli/index.ts:90-112`        | `baseUrl` from config (or `--api-url` override), `usePro` from config |
| `getApiKeyAndOptions`     | `src/cli/index.ts:186-204`       | Same pattern, used by Voice and Admin                                 |
| `AuthCommand.setKey`      | `src/cli/commands/auth.ts:29-34` | Validates entered key against _saved_ config endpoint                 |
| `InitCommand.run`         | `src/cli/commands/init.ts:41-45` | Same: validates entered key against saved config endpoint             |
| `VoiceClient`             | `src/api/voice-client.ts:23-25`  | Hardcodes `PRO_API_URL` as default, ignoring key suffix               |
| `AdminClient` (secondary) | `src/services/admin.ts:38`       | Uses `getApiKeyAndOptions()` callback                                 |

### Key suffix: never inspected

The `:fx` suffix is mentioned in docs and test data but **zero lines of production code** check for it. `src/cli/commands/auth.ts:28` has a comment acknowledging it exists, but no logic acts on it.

### VoiceClient has a duplicate PRO_API_URL constant

`src/api/voice-client.ts:19` defines its own `const PRO_API_URL = 'https://api.deepl.com'` separate from `src/api/http-client.ts:44`.

### `--api-url` flag

`src/cli/commands/register-translate.ts:54` defines `--api-url <url>` for the translate command only. This is passed as `overrideBaseUrl` to `createDeepLClient`.

### Standard DeepL URL forms in the wild

Config fixtures and tests use both bare and path-suffixed forms:

- `https://api.deepl.com`
- `https://api.deepl.com/v2`
- `https://api-free.deepl.com`
- `https://api-free.deepl.com/v2`

All of these are standard DeepL URLs (not custom regional endpoints).

### Config type constraint

`src/types/config.ts:13` types `usePro` as `boolean` (not optional). It will always have a value from config (default `true`).

## Desired Behavior

### Resolution priority (final)

1. **`--api-url` CLI flag** (translate command only) — highest priority, used as-is
2. **Custom `api.baseUrl` from config** (non-standard hostname) — used as-is
3. **API key suffix**: `:fx` → `https://api-free.deepl.com`, else → `https://api.deepl.com`
4. **`api.usePro === false`** with non-`:fx` key → `https://api-free.deepl.com`
5. **Default** → `https://api.deepl.com`

### Standard vs custom URL detection

Match on parsed **hostname only**:

- `api.deepl.com` → standard (pro tier default)
- `api-free.deepl.com` → standard (free tier default)
- Any other hostname (e.g., `api-jp.deepl.com`) → custom, always honored

Path suffixes like `/v2` are ignored for this classification.

### Key behavioral changes

1. Free keys (`:fx`) always route to `api-free.deepl.com` unless a true custom endpoint is configured.
2. A persisted `api.baseUrl` of `https://api.deepl.com` or `https://api-free.deepl.com` (with any path) is treated as a tier default, not a custom override. It does not block key-based auto-detection.
3. `auth set-key` and `init` validate against the resolved endpoint for the _entered_ key, not the saved config.
4. Voice API follows the same resolution rules (no more hardcoded pro).
5. `usePro` remains as a backward-compatible fallback but does not override `:fx` key detection.
6. Custom regional endpoints (e.g., `api-jp.deepl.com`) always win.

## Implementation Sites

| Site                      | File                             | Change                                                                |
| ------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| New resolver              | `src/utils/resolve-endpoint.ts`  | Shared helper implementing the priority chain                         |
| `createDeepLClient`       | `src/cli/index.ts:90-112`        | Use resolver; `--api-url` as highest-priority input                   |
| `getApiKeyAndOptions`     | `src/cli/index.ts:186-204`       | Use resolver                                                          |
| `AuthCommand.setKey`      | `src/cli/commands/auth.ts:29-34` | Resolve from entered key, not saved config                            |
| `InitCommand.run`         | `src/cli/commands/init.ts:41-45` | Resolve from entered key, not saved config                            |
| `VoiceClient` constructor | `src/api/voice-client.ts:23-25`  | Remove `PRO_API_URL` hardcoding; rely on resolved options from caller |
| `HttpClient` constructor  | `src/api/http-client.ts:102`     | No change needed — already respects `baseUrl`/`usePro` as passed      |

## Test Impact

| Category                                         | Impact                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Tests using non-`:fx` keys without `usePro`      | Will now resolve to pro instead of free. Nock expectations may break. |
| Tests using `:fx` keys with nock on free URL     | Already correct. No change needed.                                    |
| `voice-client.test.ts` asserting pro URL default | Must be updated to expect resolver-based selection                    |
| `document-client.test.ts` `usePro: true` test    | Still valid                                                           |
| `deepl-client.test.ts` "free by default" test    | Needs updating — default is now key-based, not always free            |
| Config fixture tests with standard URLs          | Should continue working since resolver treats them as non-custom      |

## Docs/Examples to Update

| File                                 | What changes                           |
| ------------------------------------ | -------------------------------------- |
| `docs/API.md:890`                    | Remove "voice always uses pro"         |
| `docs/API.md:2237-2238`              | Update config example                  |
| `docs/API.md:2266`                   | Update endpoint resolution description |
| `docs/TROUBLESHOOTING.md:36-37`      | Update auto-detection description      |
| `docs/TROUBLESHOOTING.md:188`        | Remove voice pro-only note             |
| `examples/19-configuration.sh`       | Rewrite manual switching section       |
| `examples/20-custom-config-files.sh` | Update embedded config JSON            |
| `examples/29-advanced-translate.sh`  | Update endpoint switching examples     |
| `README.md:960`                      | Update config output example           |
| `CHANGELOG.md`                       | Add entry under Unreleased             |

---

## Tasks

### Phase 1: Tests for resolver behavior (should fail initially — no resolver exists yet)

- [ ] Write unit tests for `resolveEndpoint()` helper:
  - [ ] `:fx` key + standard pro `baseUrl` (`https://api.deepl.com`) → `https://api-free.deepl.com`
  - [ ] `:fx` key + standard pro `baseUrl` with path (`https://api.deepl.com/v2`) → `https://api-free.deepl.com`
  - [ ] `:fx` key + standard free `baseUrl` (`https://api-free.deepl.com`) → `https://api-free.deepl.com`
  - [ ] `:fx` key + custom regional URL (`https://api-jp.deepl.com`) → `https://api-jp.deepl.com`
  - [ ] `:fx` key + custom URL with path (`https://api-jp.deepl.com/v2`) → `https://api-jp.deepl.com/v2`
  - [ ] `:fx` key + `localhost` URL → `http://localhost:...` (unchanged, custom)
  - [ ] Non-`:fx` key + no `baseUrl` → `https://api.deepl.com`
  - [ ] Non-`:fx` key + standard pro `baseUrl` → `https://api.deepl.com`
  - [ ] Non-`:fx` key + `usePro: false` → `https://api-free.deepl.com`
  - [ ] Non-`:fx` key + custom regional URL → custom URL (unchanged)
  - [ ] `--api-url` override takes highest priority regardless of key suffix
  - [ ] Empty/undefined `baseUrl` + `:fx` key → `https://api-free.deepl.com`
  - [ ] Empty/undefined `baseUrl` + non-`:fx` key → `https://api.deepl.com`

### Phase 2: Tests for auth/init validation with free keys (should fail initially)

- [ ] Write unit tests for `AuthCommand.setKey`:
  - [ ] Free key validates against free endpoint even when config has standard pro URL
  - [ ] Free key validates against custom URL if config has custom URL
  - [ ] Non-free key validates against pro endpoint
- [ ] Write unit tests for `InitCommand.run`:
  - [ ] Free key entered during init validates against free endpoint

### Phase 3: Tests for VoiceClient endpoint selection (should fail initially)

- [ ] Write unit tests for VoiceClient:
  - [ ] `:fx` key with no custom URL resolves to `api-free.deepl.com`
  - [ ] Non-`:fx` key with no custom URL resolves to `api.deepl.com`
  - [ ] Custom URL remains authoritative for voice

### Phase 4: Implement the resolver

- [ ] Create `src/utils/resolve-endpoint.ts` with `resolveEndpoint()` and `isStandardDeepLUrl()` functions
- [ ] Export `FREE_API_URL` and `PRO_API_URL` from `src/api/http-client.ts` (or move to shared location)

### Phase 5: Integrate the resolver into production code

- [ ] Update `createDeepLClient` in `src/cli/index.ts`
- [ ] Update `getApiKeyAndOptions` in `src/cli/index.ts`
- [ ] Update `AuthCommand.setKey` in `src/cli/commands/auth.ts`
- [ ] Update `InitCommand.run` in `src/cli/commands/init.ts`
- [ ] Remove `PRO_API_URL` hardcoding from `src/api/voice-client.ts`

### Phase 6: Fix broken existing tests

- [ ] Audit and update tests that assume "free by default" without key suffix logic
- [ ] Audit and update tests that assume VoiceClient always uses pro
- [ ] Audit and update config fixture tests using standard URLs
- [ ] Verify all 2757+ tests pass

### Phase 7: Update documentation and examples

- [ ] Update `docs/API.md` (voice note, config example, resolution description)
- [ ] Update `docs/TROUBLESHOOTING.md` (auto-detection, voice note)
- [ ] Update `examples/19-configuration.sh`
- [ ] Update `examples/20-custom-config-files.sh`
- [ ] Update `examples/29-advanced-translate.sh`
- [ ] Update `README.md` config output example
- [ ] Add CHANGELOG.md entry under Unreleased
