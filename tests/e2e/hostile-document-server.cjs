/**
 * Mock DeepL endpoint whose document upload answers with a hostile
 * `document_id`, used by tests/e2e/cli-document-hostile-id.e2e.test.ts.
 *
 * Purpose-specific rather than a mode on mock-deepl-server.cjs: ~20 suites
 * share that fixture, and this one has to answer every path so a redirected
 * follow-up request would succeed if one were ever issued. It records every
 * request line, which is the whole point — the assertion is about the path the
 * client asks for, not the response it gets.
 *
 * Usage: node tests/e2e/hostile-document-server.cjs
 * Prints "PORT=<number>" to stdout on startup.
 *
 *   GET  /__requests   dump the recorded { method, url } list
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('http');

const HOSTILE_DOCUMENT_ID = '../../v3/glossaries%3fpwned=1';

var requests = [];

const server = http.createServer(function (req, res) {
  let body = '';
  req.on('data', function (chunk) {
    body += chunk.toString('binary');
  });
  req.on('end', function () {
    const url = req.url || '';
    const method = req.method || '';

    if (method === 'GET' && url === '/__requests') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(requests));
      return;
    }

    requests.push({ method: method, url: url });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Connection', 'close');
    res.writeHead(200);
    if (method === 'POST' && url === '/v2/document') {
      res.end(
        JSON.stringify({
          document_id: HOSTILE_DOCUMENT_ID,
          document_key: 'hostile-key',
        })
      );
      return;
    }
    // Every other path reports a finished document, so the upload -> poll ->
    // download sequence runs to completion when nothing stops it.
    res.end(
      JSON.stringify({ document_id: HOSTILE_DOCUMENT_ID, status: 'done' })
    );
  });
});

server.keepAliveTimeout = 0;

server.listen(0, '127.0.0.1', function () {
  const addr = server.address();
  if (addr && typeof addr === 'object') {
    process.stdout.write('PORT=' + addr.port + '\n');
  }
});

process.on('SIGTERM', function () {
  server.close(function () {
    process.exit(0);
  });
});
process.on('SIGINT', function () {
  server.close(function () {
    process.exit(0);
  });
});
