const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const {
    MYSQL_HOST = 'localhost',
    MYSQL_USER = 'root',
    MYSQL_PASSWORD = '',
    MYSQL_DATABASE = 'crm_app'
  } = process.env;

  const serverRoot = __dirname;

  const TABLE_DEFINITIONS = {
  clients: `
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      external_id VARCHAR(255),
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_external_id (external_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  managers: `
    CREATE TABLE IF NOT EXISTS managers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  tasks: `
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT,
      manager_id INT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
      due_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_tasks_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      CONSTRAINT fk_tasks_manager FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  payments: `
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'USD',
      paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      CONSTRAINT fk_payments_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  storage: `
    CREATE TABLE IF NOT EXISTS storage (
      \`key\` VARCHAR(255) NOT NULL,
      \`value\` LONGTEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `
};


  const APP_DATA_DEFAULTS = {
    clients: [],
    archivedClients: [],
    managers: [],
    consultations: [],
    managerPayments: {}
  };
  const APP_DATA_KEYS = Object.keys(APP_DATA_DEFAULTS);

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
    const bootstrapConnection = await mysql.createConnection({
      host: MYSQL_HOST,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      multipleStatements: true
    });

    await bootstrapConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await bootstrapConnection.end();

    const pool = mysql.createPool({
      host: MYSQL_HOST,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    const tableStatus = {};
    for (const [tableName, createStatement] of Object.entries(TABLE_DEFINITIONS)) {
      await pool.query(createStatement);
      const [rows] = await pool.query('SHOW TABLES LIKE ?', [tableName]);
      tableStatus[tableName] = rows.length > 0;
    }

    return { pool, tableStatus };
  }

  const { pool, tableStatus } = await ensureDatabaseAndTables();
  console.log('MySQL tables checked/created:', tableStatus);

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
    if (req.method === 'GET' && req.url === '/api/app-data') {
      try {
        const [rows] = await pool.query('SELECT `key`, `value` FROM storage WHERE `key` IN (?)', [APP_DATA_KEYS]);
        const payload = buildAppDataFromRows(rows);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      } catch (error) {
        console.error('Failed to fetch app data from MySQL:', error);
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

        await pool.query(
          `INSERT INTO storage (\`key\`, \`value\`) VALUES ?
           ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = CURRENT_TIMESTAMP;`,
          [entries]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'saved', updated: entries.map(([key]) => key) }));
      } catch (error) {
        console.error('Failed to save app data to MySQL:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save app data' }));
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/api/storage') {
      try {
        const [rows] = await pool.query('SELECT `key`, `value` FROM storage');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: rows }));
      } catch (error) {
        console.error('Failed to read storage from MySQL:', error);
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

        await pool.query(
          `INSERT INTO storage (
            \`key\`, \`value\`
          ) VALUES (?, ?)
          ON DUPLICATE KEY UPDATE
            \`value\` = VALUES(\`value\`),
            updated_at = CURRENT_TIMESTAMP;`,
          [payload.key, payload.value ?? '']
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'saved' }));
      } catch (error) {
        console.error('Failed to save storage to MySQL:', error);
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

        await pool.query('DELETE FROM storage WHERE `key` = ?', [payload.key]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'deleted' }));
      } catch (error) {
        console.error('Failed to delete storage from MySQL:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to delete storage' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/storage/clear') {
      try {
        await pool.query('TRUNCATE TABLE storage');
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
        const [rows] = await pool.query('SELECT * FROM clients ORDER BY id DESC');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
      } catch (error) {
        console.error('Failed to fetch clients from MySQL:', error);
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

          const connection = await pool.getConnection();
          try {
            await connection.beginTransaction();

            const [existing] = await connection.query('SELECT id FROM clients');
            const existingIds = existing.map(row => row.id);
            const payloadIds = clients
              .map(client => client.id)
              .filter(id => id !== undefined && id !== null);

            const idsToDelete = existingIds.filter(id => !payloadIds.includes(id));
            if (idsToDelete.length > 0) {
              await connection.query('DELETE FROM clients WHERE id IN (?)', [idsToDelete]);
            }

            const insertOrUpdateClient = `
              INSERT INTO clients (id, external_id, full_name, email, phone)
              VALUES (?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                external_id = VALUES(external_id),
                full_name = VALUES(full_name),
                email = VALUES(email),
                phone = VALUES(phone),
                updated_at = CURRENT_TIMESTAMP;
            `;

            for (const client of clients) {
              await connection.query(insertOrUpdateClient, [
                client.id || null,
                client.external_id || null,
                client.full_name || client.name || 'Без имени',
                client.email || null,
                client.phone || null
              ]);
            }

            await connection.commit();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } catch (error) {
            await connection.rollback();
            console.error('Failed to upsert clients into MySQL:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to save clients' }));
          } finally {
            connection.release();
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
        const [rows] = await pool.query('SELECT * FROM managers ORDER BY id DESC');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
      } catch (error) {
        console.error('Failed to fetch managers from MySQL:', error);
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

        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          const [existing] = await connection.query('SELECT id FROM managers');
          const existingIds = existing.map(row => row.id);
          const payloadIds = payload
            .map(manager => manager.id)
            .filter(id => id !== undefined && id !== null);

          const idsToDelete = existingIds.filter(id => !payloadIds.includes(id));
          if (idsToDelete.length > 0) {
            await connection.query('DELETE FROM managers WHERE id IN (?)', [idsToDelete]);
          }

          const insertOrUpdateManager = `
            INSERT INTO managers (id, full_name, email, phone)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              full_name = VALUES(full_name),
              email = VALUES(email),
              phone = VALUES(phone),
              updated_at = CURRENT_TIMESTAMP;
          `;

          for (const manager of payload) {
            await connection.query(insertOrUpdateManager, [
              manager.id || null,
              manager.full_name || manager.name || manager.title || 'Без имени',
              manager.email || null,
              manager.phone || manager.telephone || null
            ]);
          }

          await connection.commit();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } catch (error) {
          await connection.rollback();
          console.error('Failed to upsert managers into MySQL:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to save managers' }));
        } finally {
          connection.release();
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
          database: MYSQL_DATABASE,
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
