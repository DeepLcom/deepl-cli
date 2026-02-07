/**
 * Mock DeepL API server for E2E testing.
 * Simulates key DeepL API endpoints so the CLI can be tested end-to-end
 * without a real API key.
 *
 * Usage: node tests/e2e/mock-deepl-server.cjs
 * Prints PORT=<number> to stdout on startup.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('http');

function handleRequest(req, res, body) {
  const url = req.url || '';
  const method = req.method || '';

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Connection', 'close');
  res.setHeader('X-Trace-ID', 'mock-trace-id-12345');

  if (method === 'POST' && url === '/v2/translate') {
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
