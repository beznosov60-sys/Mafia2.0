const http = require('http');
const fs = require('fs');
const path = require('path');

(async () => {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = 'https://zktbasskylvqprofkinb.supabase.co';
  const supabaseKey = process.env.SUPABASE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

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
  const safePath = path.normalize(req.url).replace(/^\/+/, '');
  const filePath = path.join(__dirname, safePath || 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
})().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
