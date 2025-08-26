const http = require('http');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const SUPABASE_URL = 'https://qsyzvhykblrkouvemcmg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzeXp2aHlrYmxya291dmVtY21nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTg0MDcsImV4cCI6MjA3MTc3NDQwN30.e6sj8qlITUxXLI9twwRCme5ubyf-lFEHLhA1lNHjPB0';
const TABLE = 'clients';

async function readClients() {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=*`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!resp.ok) throw new Error(await resp.text());
    return await resp.json();
  } catch (err) {
    console.error('Error fetching clients from Supabase', err);
    return [];
  }
}

async function writeClients(clients) {
  try {
    // Clear existing rows
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=not.is.null`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
    });
    if (clients.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(clients),
      });
    }
  } catch (err) {
    console.error('Error saving clients to Supabase', err);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/clients') {
    const clients = await readClients();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(clients));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/clients') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        const clients = JSON.parse(body || '[]');
        await writeClients(clients);
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
