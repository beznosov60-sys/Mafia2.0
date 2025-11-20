const http = require('http');
const fs = require('fs');
const path = require('path');
let Database;
try {
  // Preferred: performant native binding
  Database = require('better-sqlite3');
} catch (error) {
  // Fallback to the built-in experimental driver if native bindings are unavailable
  const { DatabaseSync } = require('node:sqlite');
  Database = DatabaseSync;
}

(async () => {
  const serverRoot = __dirname;
  const DATA_DIR = path.join(serverRoot, 'data');
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  const DATABASE_PATH = path.join(DATA_DIR, 'crm.db');

  const TABLE_DEFINITIONS = {
    clients: `
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (DATETIME('now')),
      updated_at TEXT DEFAULT (DATETIME('now'))
    );
  `,
    managers: `
    CREATE TABLE IF NOT EXISTS managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (DATETIME('now')),
      updated_at TEXT DEFAULT (DATETIME('now'))
    );
  `,
    tasks: `
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      manager_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      created_at TEXT DEFAULT (DATETIME('now')),
      updated_at TEXT DEFAULT (DATETIME('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE SET NULL
    );
  `,
    payments: `
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      paid_at TEXT DEFAULT (DATETIME('now')),
      notes TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
  `,
    storage: `
    CREATE TABLE IF NOT EXISTS storage (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (DATETIME('now'))
    );
  `
  };


  const APP_DATA_DEFAULTS = {
    archivedClients: [],
    consultations: [],
    managerPayments: {}
  };
  const APP_DATA_KEYS = Object.keys(APP_DATA_DEFAULTS);

  const db = new Database(DATABASE_PATH);

  const dbRun = async (sql, params = []) => {
    try {
      const statement = db.prepare(sql);
      return statement.run(...params);
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const dbAll = async (sql, params = []) => {
    try {
      const statement = db.prepare(sql);
      return statement.all(...params);
    } catch (error) {
      return Promise.reject(error);
    }
  };

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

  async function ensureDatabaseAndTables() {
    await dbRun('PRAGMA foreign_keys = ON;');

    const tableStatus = {};
    for (const [tableName, createStatement] of Object.entries(TABLE_DEFINITIONS)) {
      await dbRun(createStatement);
      tableStatus[tableName] = true;
    }

    return { tableStatus };
  }

  const { tableStatus } = await ensureDatabaseAndTables();
  console.log('SQLite tables checked/created:', tableStatus);

  async function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        if (!body) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  function buildAppDataFromRows(rows = []) {
    const payload = { ...APP_DATA_DEFAULTS };

    for (const entry of rows) {
      const key = entry?.key;
      if (!APP_DATA_KEYS.includes(key)) continue;
      try {
        const parsed = JSON.parse(entry.value || 'null');
        if (parsed !== null && parsed !== undefined) {
          payload[key] = parsed;
        }
      } catch (error) {
        console.error('Failed to parse stored app data row', key, error);
      }
    }

    return payload;
  }

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/api/app-data') {
      try {
        const placeholders = APP_DATA_KEYS.map(() => '?').join(', ');
        const rows = await dbAll(`SELECT key, value FROM storage WHERE key IN (${placeholders})`, APP_DATA_KEYS);
        const payload = buildAppDataFromRows(rows);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      } catch (error) {
        console.error('Failed to fetch app data from SQLite:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load app data' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/app-data') {
      try {
        const payload = await parseJsonBody(req);
        if (!payload || typeof payload !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payload' }));
          return;
        }

        const entries = APP_DATA_KEYS
          .filter(key => Object.prototype.hasOwnProperty.call(payload, key))
          .map(key => [key, JSON.stringify(payload[key] ?? APP_DATA_DEFAULTS[key])]);

        if (entries.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No valid keys to save' }));
          return;
        }

        await dbRun('BEGIN TRANSACTION;');
        try {
          for (const [key, value] of entries) {
            await dbRun(
              `INSERT INTO storage (key, value, updated_at) VALUES (?, ?, DATETIME('now'))
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
              [key, value]
            );
          }
          await dbRun('COMMIT;');
        } catch (transactionError) {
          await dbRun('ROLLBACK;');
          throw transactionError;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'saved', updated: entries.map(([key]) => key) }));
      } catch (error) {
        console.error('Failed to save app data to SQLite:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save app data' }));
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/api/storage') {
      try {
        const rows = await dbAll('SELECT key, value FROM storage');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: rows }));
      } catch (error) {
        console.error('Failed to read storage from SQLite:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load storage' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/storage') {
      try {
        const payload = await parseJsonBody(req);
        if (!payload || typeof payload.key !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Key is required' }));
          return;
        }

        await dbRun(
          `INSERT INTO storage (
            key, value, updated_at
          ) VALUES (?, ?, DATETIME('now'))
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at;`,
          [payload.key, payload.value ?? '']
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'saved' }));
      } catch (error) {
        console.error('Failed to save storage to SQLite:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save storage' }));
      }
      return;
    }

    if (req.method === 'DELETE' && req.url === '/api/storage') {
      try {
        const payload = await parseJsonBody(req);
        if (!payload || typeof payload.key !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Key is required' }));
          return;
        }

        await dbRun('DELETE FROM storage WHERE key = ?', [payload.key]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'deleted' }));
      } catch (error) {
        console.error('Failed to delete storage from SQLite:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to delete storage' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/storage/clear') {
      try {
        await dbRun('DELETE FROM storage');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'cleared' }));
      } catch (error) {
        console.error('Failed to clear storage table:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to clear storage' }));
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/api/clients') {
      try {
        const rows = await dbAll('SELECT * FROM clients ORDER BY id DESC');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
      } catch (error) {
        console.error('Failed to fetch clients from SQLite:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch clients' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/clients') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', async () => {
        try {
          const clients = JSON.parse(body || '[]');

          if (!Array.isArray(clients)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Payload must be an array of clients' }));
            return;
          }

          await dbRun('BEGIN TRANSACTION;');
          try {
            const existing = await dbAll('SELECT id FROM clients');
            const existingIds = existing.map(row => row.id);
            const payloadIds = clients
              .map(client => client.id)
              .filter(id => id !== undefined && id !== null);

            const idsToDelete = existingIds.filter(id => !payloadIds.includes(id));
            if (idsToDelete.length > 0) {
              const placeholders = idsToDelete.map(() => '?').join(', ');
              await dbRun(`DELETE FROM clients WHERE id IN (${placeholders})`, idsToDelete);
            }

            for (const client of clients) {
              const fullName = client.full_name || client.name || 'Без имени';
              const email = client.email || null;
              const phone = client.phone || null;

              if (client.id) {
                await dbRun(
                  `INSERT INTO clients (id, external_id, full_name, email, phone, updated_at)
                   VALUES (?, ?, ?, ?, ?, DATETIME('now'))
                   ON CONFLICT(id) DO UPDATE SET
                     external_id = excluded.external_id,
                     full_name = excluded.full_name,
                     email = excluded.email,
                     phone = excluded.phone,
                     updated_at = DATETIME('now');`,
                  [client.id, client.external_id || null, fullName, email, phone]
                );
              } else {
                await dbRun(
                  `INSERT INTO clients (external_id, full_name, email, phone, updated_at)
                   VALUES (?, ?, ?, ?, DATETIME('now'))
                   ON CONFLICT(external_id) DO UPDATE SET
                     full_name = excluded.full_name,
                     email = excluded.email,
                     phone = excluded.phone,
                     updated_at = DATETIME('now');`,
                  [client.external_id || null, fullName, email, phone]
                );
              }
            }

            await dbRun('COMMIT;');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } catch (error) {
            await dbRun('ROLLBACK;');
            console.error('Failed to upsert clients into SQLite:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to save clients' }));
          }
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/managers') {
      try {
        const rows = await dbAll('SELECT * FROM managers ORDER BY id DESC');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
      } catch (error) {
        console.error('Failed to fetch managers from SQLite:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch managers' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/managers') {
      try {
        const payload = await parseJsonBody(req);

        if (!Array.isArray(payload)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload must be an array of managers' }));
          return;
        }

        await dbRun('BEGIN TRANSACTION;');
        try {
          const existing = await dbAll('SELECT id FROM managers');
          const existingIds = existing.map(row => row.id);
          const payloadIds = payload
            .map(manager => manager.id)
            .filter(id => id !== undefined && id !== null);

          const idsToDelete = existingIds.filter(id => !payloadIds.includes(id));
          if (idsToDelete.length > 0) {
            const placeholders = idsToDelete.map(() => '?').join(', ');
            await dbRun(`DELETE FROM managers WHERE id IN (${placeholders})`, idsToDelete);
          }

          for (const manager of payload) {
            const fullName = manager.full_name || manager.name || manager.title || 'Без имени';
            const email = manager.email || null;
            const phone = manager.phone || manager.telephone || null;

            if (manager.id) {
              await dbRun(
                `INSERT INTO managers (id, full_name, email, phone, updated_at)
                 VALUES (?, ?, ?, ?, DATETIME('now'))
                 ON CONFLICT(id) DO UPDATE SET
                   full_name = excluded.full_name,
                   email = excluded.email,
                   phone = excluded.phone,
                   updated_at = DATETIME('now');`,
                [manager.id, fullName, email, phone]
              );
            } else {
              await dbRun('INSERT INTO managers (full_name, email, phone) VALUES (?, ?, ?);', [fullName, email, phone]);
            }
          }

          await dbRun('COMMIT;');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } catch (error) {
          await dbRun('ROLLBACK;');
          console.error('Failed to upsert managers into SQLite:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to save managers' }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/api/db-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          database: DATABASE_PATH,
          tables: tableStatus
        })
      );
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
