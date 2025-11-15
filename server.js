const http = require('http');
const fs = require('fs');
const path = require('path');

(async () => {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = 'https://zktbasskylvqprofkinb.supabase.co';
  const supabaseKey = process.env.SUPABASE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const serverRoot = __dirname;

  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8'
  };

  function resolveStaticPath(requestUrl) {
    try {
      const [rawPath] = requestUrl.split('?');
      const decodedPath = decodeURIComponent(rawPath);
      let safePath = path
        .normalize(decodedPath)
        .replace(/^([.][.][/\\])+/, '')
        .replace(/^\/+/, '');

      if (!safePath || safePath === path.sep) {
        safePath = 'index.html';
      }

      const absolutePath = path.join(serverRoot, safePath);

      if (!absolutePath.startsWith(serverRoot)) {
        return null;
      }

      return absolutePath;
    } catch (error) {
      console.error('Failed to resolve static path for request', requestUrl, error);
      return null;
    }
  }

  async function serveStaticFile(filePath, res) {
    try {
      const stats = await fs.promises.stat(filePath);
      let finalPath = filePath;

      if (stats.isDirectory()) {
        finalPath = path.join(filePath, 'index.html');
      }

      const ext = path.extname(finalPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      const stream = fs.createReadStream(finalPath);
      stream.on('open', () => {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
        });
      });

      stream.on('error', error => {
        console.error('Error while streaming static file:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('Internal Server Error');
      });

      stream.pipe(res);
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      console.error('Failed to serve static file:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  }

  const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/clients') {
    const { data, error } = await supabase.from('clients').select('*');
    if (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/clients') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        const clients = JSON.parse(body || '[]');

        // Fetch existing client IDs to determine which should be removed
        const { data: existing, error: existingError } = await supabase
          .from('clients')
          .select('id');
        if (existingError) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: existingError.message }));
          return;
        }

        const payloadIds = clients.map(c => c.id);
        const idsToDelete = existing
          .map(row => row.id)
          .filter(id => !payloadIds.includes(id));

        if (idsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from('clients')
            .delete()
            .in('id', idsToDelete);
          if (deleteError) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: deleteError.message }));
            return;
          }
        }

        const { error } = await supabase.from('clients').upsert(clients);
        if (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Serve static files
  const filePath = resolveStaticPath(req.url);
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  await serveStaticFile(filePath, res);
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
})().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
