import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Route map: clean URLs → files
const ROUTES: Record<string, string> = {
  '/': 'index.html',
  '/login': 'login.html',
  '/dashboard': 'dashboard.html',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Route clean URLs
  const fileName = ROUTES[pathname];
  if (fileName) {
    try {
      const content = await readFile(join(PUBLIC, fileName), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    } catch {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
  }

  // Serve static files
  try {
    const filePath = join(PUBLIC, pathname);
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Demo app running at http://localhost:${PORT}`);
  console.log(`  Login:     http://localhost:${PORT}/login`);
  console.log(`  Dashboard: http://localhost:${PORT}/dashboard\n`);
});
