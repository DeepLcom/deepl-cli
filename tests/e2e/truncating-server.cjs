/**
 * A server that answers 200, declares a Content-Length, writes part of the
 * body and then destroys the socket — a server-caused mid-body abort, which
 * axios surfaces as ERR_BAD_RESPONSE / 'stream has been aborted' with the 200
 * response still attached to the error.
 *
 * Prints `PORT=<port>` on stdout once listening, and rewrites the file given as
 * argv[2] with the number of requests received so far. Runs in its own process
 * because the test driver blocks its own event loop on execSync and would
 * otherwise never accept the connection.
 *
 * Usage: node tests/e2e/truncating-server.cjs /path/to/count-file
 */

const http = require('http');
const fs = require('fs');

const countFile = process.argv[2];
let requests = 0;

const BODY = JSON.stringify({
  translations: [
    { text: 'Hola', detected_source_language: 'EN', billed_characters: 5 },
  ],
  character_count: 0,
  character_limit: 1000000,
});

const server = http.createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    requests++;
    if (countFile) {
      fs.writeFileSync(countFile, String(requests));
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', String(Buffer.byteLength(BODY)));
    res.writeHead(200);
    res.write(BODY.slice(0, 12));
    setTimeout(() => res.socket.destroy(), 20);
  });
});

// Ignore mid-flight socket errors from clients that give up.
server.on('clientError', () => {});

server.listen(0, '127.0.0.1', () => {
  if (countFile) {
    fs.writeFileSync(countFile, '0');
  }
  process.stdout.write(`PORT=${server.address().port}\n`);
});
