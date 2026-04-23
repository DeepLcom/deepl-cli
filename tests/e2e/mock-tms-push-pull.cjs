/**
 * Minimal mock TMS server used by tests/e2e/cli-sync-push-pull.e2e.test.ts.
 *
 * Implements only the surface the push/pull dispatch path exercises:
 *   PUT  /api/projects/:projectId/keys/:key           push a translation
 *   GET  /api/projects/:projectId/keys/export         pull approved translations
 *
 * Plus a tiny control plane for the driving test:
 *   POST /__reset                                      clear all captured state
 *   POST /__configure                                  set pullResponses map
 *   GET  /__inspect                                    dump requests + pushed
 *
 * Usage: node tests/e2e/mock-tms-push-pull.cjs
 * Prints "PORT=<number>" to stdout on startup.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('http');

const PROJECT_ID = 'push-pull-proj';

var state = freshState();

function freshState() {
  return {
    requests: [],
    pushed: {},
    pullResponses: {},
  };
}

function handleRequest(req, res, body) {
  const url = req.url || '';
  const method = req.method || '';

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Connection', 'close');

  if (method === 'POST' && url === '/__reset') {
    state = freshState();
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (method === 'GET' && url === '/__inspect') {
    res.writeHead(200);
    res.end(JSON.stringify(state));
    return;
  }

  if (method === 'POST' && url === '/__configure') {
    try {
      const cfg = body ? JSON.parse(body) : {};
      if (cfg.pullResponses) state.pullResponses = cfg.pullResponses;
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: String(err.message) }));
    }
    return;
  }

  const tmsMatch = url.match(new RegExp('^/api/projects/([^/]+)(/.*)?$'));
  if (tmsMatch) {
    const projectId = decodeURIComponent(tmsMatch[1]);
    const rest = tmsMatch[2] || '';

    state.requests.push({
      method: method,
      url: url,
      projectId: projectId,
      authHeader: req.headers['authorization'] || null,
      body: body || null,
    });

    if (projectId !== PROJECT_ID) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'unknown project' }));
      return;
    }

    const pushMatch = rest.match(/^\/keys\/([^?]+)$/);
    if (method === 'PUT' && pushMatch && !/^\/keys\/export/.test(rest)) {
      const key = decodeURIComponent(pushMatch[1]);
      if (key !== 'export') {
        const parsed = body ? JSON.parse(body) : { locale: '', value: '' };
        if (!state.pushed[parsed.locale]) state.pushed[parsed.locale] = {};
        state.pushed[parsed.locale][key] = parsed.value;
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }
    }

    if (method === 'GET' && /^\/keys\/export/.test(rest)) {
      const parsedUrl = new URL(url, 'http://127.0.0.1');
      const locale = parsedUrl.searchParams.get('locale') || '';
      const canned = state.pullResponses[locale] || {};
      res.writeHead(200);
      res.end(JSON.stringify(canned));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'tms route not found', url: url }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found', url: url }));
}

const server = http.createServer(function (req, res) {
  let body = '';
  req.on('data', function (chunk) { body += chunk.toString(); });
  req.on('end', function () { handleRequest(req, res, body); });
});

server.keepAliveTimeout = 0;

server.listen(0, '127.0.0.1', function () {
  const addr = server.address();
  if (addr && typeof addr === 'object') {
    process.stdout.write('PORT=' + addr.port + '\n');
  }
});

process.on('SIGTERM', function () { server.close(function () { process.exit(0); }); });
process.on('SIGINT', function () { server.close(function () { process.exit(0); }); });
