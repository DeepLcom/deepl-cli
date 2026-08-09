/**
 * A Write API mock that can answer either outcome the `--check` workflow has to
 * distinguish, keyed on the TEXT rather than on the request index so a test does
 * not depend on how many calls preceded it.
 *
 * Text containing the word `polished` comes back unchanged, which is what a
 * clean check looks like; anything else comes back with ` (improved)` appended,
 * which is a one-word change. Both `/v2/write/rephrase` and `/v2/write/correct`
 * answer, so `write` and `correct` share the server.
 *
 * Prints `PORT=<port>` on stdout once listening. Runs in its own process because
 * the test driver blocks its own event loop on spawnSync and would otherwise
 * never accept the connection.
 *
 * Usage: node tests/e2e/write-check-server.cjs
 */

const http = require('http');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');

    if (
      req.method === 'POST' &&
      (req.url === '/v2/write/rephrase' || req.url === '/v2/write/correct')
    ) {
      const params = new URLSearchParams(body);
      const improvements = params.getAll('text').map((text) => ({
        text: text.includes('polished') ? text : text + ' (improved)',
        target_language: params.get('target_lang') || 'en-US',
        detected_source_language: 'EN',
      }));

      res.writeHead(200);
      res.end(JSON.stringify({ improvements }));
      return;
    }

    res.writeHead(404);
    res.end(
      JSON.stringify({ message: 'no route: ' + req.method + ' ' + req.url })
    );
  });
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write('PORT=' + server.address().port + '\n');
});
