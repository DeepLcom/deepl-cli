/**
 * Mock DeepL API server for E2E testing.
 * Simulates key DeepL API endpoints so the CLI can be tested end-to-end
 * without a real API key.
 *
 * Also provides a mock TMS endpoint suite (push/pull) and inspection
 * hooks used by the sync-tms E2E tests:
 *   PUT  /api/projects/:projectId/keys/:key         -> push a translation
 *   GET  /api/projects/:projectId/keys/export       -> pull translations
 *   GET  /api/projects/:projectId                   -> project status
 *   POST /__reset                                    -> clear recorded state
 *   GET  /__inspect                                  -> return captured requests + pushed store
 *   POST /__configure                                -> set response overrides for TMS routes
 *
 * Usage: node tests/e2e/mock-deepl-server.cjs
 * Prints PORT=<number> to stdout on startup.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('http');

// TMS state captured for tests to inspect
var tmsState = {
  // array of { method, url, authHeader, body }
  requests: [],
  // { [locale]: { [key]: value } } populated by PUT /keys/:key
  pushed: {},
  // { [locale]: { [key]: value } } returned by GET /keys/export
  pullResponses: {},
  // when non-null, TMS routes reply with this status/body
  forceStatus: null,
  forceBody: null,
  // counters for DeepL API endpoints (exposed via /__inspect)
  translateCalls: 0,
};

function resetTmsState() {
  tmsState = {
    requests: [],
    pushed: {},
    pullResponses: {},
    forceStatus: null,
    forceBody: null,
    translateCalls: 0,
  };
}

function handleRequest(req, res, body) {
  const url = req.url || '';
  const method = req.method || '';

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Connection', 'close');
  res.setHeader('X-Trace-ID', 'mock-trace-id-12345');

  // ---- Control plane (test harness) ----

  if (method === 'POST' && url === '/__reset') {
    resetTmsState();
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (method === 'GET' && url === '/__inspect') {
    res.writeHead(200);
    res.end(JSON.stringify(tmsState));
    return;
  }

  if (method === 'POST' && url === '/__configure') {
    try {
      const cfg = body ? JSON.parse(body) : {};
      if (cfg.pullResponses) tmsState.pullResponses = cfg.pullResponses;
      if (cfg.forceStatus !== undefined) tmsState.forceStatus = cfg.forceStatus;
      if (cfg.forceBody !== undefined) tmsState.forceBody = cfg.forceBody;
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'bad __configure body: ' + err.message }));
    }
    return;
  }

  // ---- TMS routes ----

  var tmsMatch = url.match(/^\/api\/projects\/([^/]+)(\/.*)?$/);
  if (tmsMatch) {
    var projectId = decodeURIComponent(tmsMatch[1]);
    var rest = tmsMatch[2] || '';

    tmsState.requests.push({
      method: method,
      url: url,
      projectId: projectId,
      authHeader: req.headers['authorization'] || null,
      body: body || null,
    });

    if (tmsState.forceStatus !== null) {
      res.writeHead(tmsState.forceStatus);
      res.end(JSON.stringify(tmsState.forceBody || { error: 'forced failure' }));
      return;
    }

    // PUT /keys/:key  -> push a single translation
    var pushMatch = rest.match(/^\/keys\/([^?]+)$/);
    if (method === 'PUT' && pushMatch && !/^\/keys\/export/.test(rest)) {
      var key = decodeURIComponent(pushMatch[1]);
      if (key !== 'export') {
        var parsed = body ? JSON.parse(body) : {};
        var locale = parsed.locale || 'unknown';
        var value = parsed.value;
        if (!tmsState.pushed[locale]) tmsState.pushed[locale] = {};
        tmsState.pushed[locale][key] = value;
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }
    }

    // GET /keys/export?format=json&locale=XX  -> pull translations
    if (method === 'GET' && /^\/keys\/export/.test(rest)) {
      var parsedUrl = new URL(url, 'http://127.0.0.1');
      var localeParam = parsedUrl.searchParams.get('locale') || '';
      var canned = tmsState.pullResponses[localeParam] || {};
      res.writeHead(200);
      res.end(JSON.stringify(canned));
      return;
    }

    // GET /api/projects/:projectId  -> project status (not currently consumed by the CLI)
    if (method === 'GET' && rest === '') {
      res.writeHead(200);
      res.end(JSON.stringify({ project_id: projectId, status: 'ok' }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'tms route not found', url: url }));
    return;
  }

  // ---- DeepL translate/write/usage/languages endpoints (existing) ----

  if (method === 'POST' && url === '/v2/translate') {
    tmsState.translateCalls += 1;
    const params = new URLSearchParams(body);
    const targetLang = params.get('target_lang') || 'ES';
    const texts = params.getAll('text');

    const translations = {
      'Hello': 'Hola',
      'Hello world': 'Hola mundo',
      'Good morning': 'Buenos dias',
      'Translate me': 'Traduceme',
    };

    const responseBody = {
      translations: texts.map(function(t) {
        return {
          detected_source_language: 'EN',
          text: translations[t] || ('[' + targetLang + '] ' + t),
          model_type_used: 'quality_optimized',
        };
      }),
    };

    res.writeHead(200);
    res.end(JSON.stringify(responseBody));
    return;
  }

  if (method === 'POST' && url === '/v2/write/rephrase') {
    const params = new URLSearchParams(body);
    const texts = params.getAll('text');
    const inputText = texts[0] || '';

    const responseBody = {
      improvements: [{
        text: 'Improved: ' + inputText,
        target_language: params.get('target_lang') || 'en-US',
        detected_source_language: 'EN',
      }],
    };

    res.writeHead(200);
    res.end(JSON.stringify(responseBody));
    return;
  }

  if (method === 'GET' && url.startsWith('/v2/usage')) {
    const responseBody = {
      character_count: 42000,
      character_limit: 500000,
    };

    res.writeHead(200);
    res.end(JSON.stringify(responseBody));
    return;
  }

  if (method === 'GET' && url.startsWith('/v2/languages')) {
    const parsedUrl = new URL(url, 'http://127.0.0.1');
    const type = parsedUrl.searchParams.get('type');

    var languages;
    if (type === 'source') {
      languages = [
        { language: 'EN', name: 'English' },
        { language: 'DE', name: 'German' },
        { language: 'FR', name: 'French' },
        { language: 'ES', name: 'Spanish' },
      ];
    } else {
      languages = [
        { language: 'EN-US', name: 'English (American)', supports_formality: false },
        { language: 'EN-GB', name: 'English (British)', supports_formality: false },
        { language: 'DE', name: 'German', supports_formality: true },
        { language: 'FR', name: 'French', supports_formality: true },
        { language: 'ES', name: 'Spanish', supports_formality: true },
      ];
    }

    res.writeHead(200);
    res.end(JSON.stringify(languages));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ message: 'Not found' }));
}

var server = http.createServer(function(req, res) {
  var body = '';
  req.on('data', function(chunk) {
    body += chunk.toString();
  });
  req.on('end', function() {
    handleRequest(req, res, body);
  });
});

server.keepAliveTimeout = 0;

server.listen(0, '127.0.0.1', function() {
  var addr = server.address();
  if (addr && typeof addr === 'object') {
    process.stdout.write('PORT=' + addr.port + '\n');
  }
});

process.on('SIGTERM', function() {
  server.close(function() { process.exit(0); });
});

process.on('SIGINT', function() {
  server.close(function() { process.exit(0); });
});
