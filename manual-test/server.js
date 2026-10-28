/**
 * TEMPORARY LOCAL MANUAL TESTING SERVER FOR GOOGLE OAUTH
 * 
 * Development-only utility to serve the Google OAuth test harness.
 * Do not run or deploy in production.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Port for serving the local test harness (matches default FRONTEND_URL in .env)
const TEST_PORT = process.env.TEST_HARNESS_PORT ? parseInt(process.env.TEST_HARNESS_PORT, 10) : 3000;
const HTML_FILE_PATH = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  // CORS headers allowing browser to load
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(HTML_FILE_PATH, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error loading test harness HTML: ' + err.message);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  if (url.pathname === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      clientId: env.GOOGLE_CLIENT_ID || '',
      backendUrl: `http://localhost:${env.PORT || 5000}`,
      status: 'ok',
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(TEST_PORT, () => {
  const localOrigin = `http://localhost:${TEST_PORT}`;
  console.log('\n================================================================');
  console.log('   ⚠️  GOOGLE OAUTH LOCAL MANUAL TEST HARNESS (DEV ONLY)');
  console.log('================================================================');
  console.log(` Test Harness Origin:   ${localOrigin}`);
  console.log(` Target Backend API:    http://localhost:${env.PORT || 5000}`);
  console.log(` Configured Client ID:  ${env.GOOGLE_CLIENT_ID || '[NOT CONFIGURED]'}`);
  console.log('----------------------------------------------------------------');
  console.log(' REQUIRED GOOGLE CLOUD CONSOLE SETTING:');
  console.log(' In Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0:');
  console.log(` Add to "Authorized JavaScript origins":`);
  console.log(`   👉  ${localOrigin}`);
  console.log(' (Note: No trailing slash)');
  console.log('----------------------------------------------------------------');
  console.log(` 👉 Open your browser at: ${localOrigin}`);
  console.log(' Press Ctrl+C to terminate this temporary server when finished.');
  console.log('================================================================\n');
});

process.on('SIGINT', () => {
  console.log('\nStopping manual test server...');
  server.close(() => {
    process.exit(0);
  });
});
