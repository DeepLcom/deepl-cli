/**
 * A translation endpoint that re-cases and re-spaces the `__VAR_n__` tokens the
 * CLI substitutes for a user's placeholders — ordinary MT behaviour for a token
 * the engine does not recognise, and the shape that used to write the CLI's own
 * scaffolding into a user's file at exit 0.
 *
 * Prints `PORT=<port>` on stdout once listening. Runs in its own process because
 * the test driver blocks its event loop on execSync.
 *
 * Usage: node tests/e2e/mangling-server.cjs
 */

const http = require('http');
const { URLSearchParams } = require('url');

function mangle(text) {
  return text.replace(/__VAR_(\d+)__/g, '__ Var_$1 __');
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');

    if ((req.url || '').startsWith('/v2/usage')) {
      res.writeHead(200);
      return res.end(
        JSON.stringify({ character_count: 0, character_limit: 1000000 })
      );
    }

    if (!(req.url || '').startsWith('/v2/translate')) {
      res.writeHead(404);
      return res.end(JSON.stringify({ message: 'not found' }));
    }

    const texts = new URLSearchParams(body).getAll('text');
    res.writeHead(200);
    res.end(
      JSON.stringify({
        translations: texts.map((text) => ({
          text: `[de] ${mangle(text)}`,
          detected_source_language: 'EN',
          billed_characters: text.length,
        })),
      })
    );
  });
});

server.on('clientError', () => {});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT=${server.address().port}\n`);
});
