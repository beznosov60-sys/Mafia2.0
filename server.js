const http = require('http');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zktbasskylvqprofkinb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const DIST_DIR = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'clients.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let supabaseClient = null;

async function initSupabase() {
  if (!SUPABASE_KEY) {
    console.warn('SUPABASE_KEY не задан. Сервер будет использовать локальный JSON-файл.');
    return;
  }
  try {
    const { createClient } = await import('@supabase/supabase-js');
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (error) {
    console.error('Не удалось инициализировать Supabase, будет использован локальный JSON-файл:', error);
    supabaseClient = null;
  }
}

async function ensureDataFileExists() {
  try {
    await fsPromises.mkdir(DATA_DIR, { recursive: true });
    await fsPromises.access(DATA_FILE, fs.constants.F_OK);
  } catch {
    await fsPromises.writeFile(DATA_FILE, '[]', 'utf-8');
  }
}

async function readClientsFromFile() {
  try {
    await ensureDataFileExists();
    const raw = await fsPromises.readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Не удалось прочитать клиентов из файла:', error);
    return [];
  }
}

async function writeClientsToFile(clients) {
  try {
    await ensureDataFileExists();
    await fsPromises.writeFile(DATA_FILE, JSON.stringify(clients, null, 2), 'utf-8');
    return { status: 'ok' };
  } catch (error) {
    console.error('Не удалось сохранить клиентов в файл:', error);
    throw error;
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

async function handleGetClients(res) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient.from('clients').select('*');
    if (error) {
      console.error('Supabase GET ошибка:', error);
      return handleFileGet(res);
    }
    return sendJson(res, 200, data || []);
  }
  return handleFileGet(res);
}

async function handleFileGet(res) {
  const clients = await readClientsFromFile();
  return sendJson(res, 200, clients);
}

async function handlePostClients(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      sendJson(res, 400, { error: 'Некорректный формат данных' });
      return;
    }

    if (supabaseClient) {
      const { data: existing, error: existingError } = await supabaseClient.from('clients').select('id');
      if (existingError) {
        console.error('Supabase select error:', existingError);
        sendJson(res, 500, { error: existingError.message });
        return;
      }

      const payloadIds = parsed.map((client) => client.id);
      const idsToDelete = (existing || [])
        .map((row) => row.id)
        .filter((id) => !payloadIds.includes(id));

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabaseClient.from('clients').delete().in('id', idsToDelete);
        if (deleteError) {
          console.error('Supabase delete error:', deleteError);
          sendJson(res, 500, { error: deleteError.message });
          return;
        }
      }

      const { error } = await supabaseClient.from('clients').upsert(parsed, { onConflict: 'id' });
      if (error) {
        console.error('Supabase upsert error:', error);
        sendJson(res, 500, { error: error.message });
        return;
      }
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    await writeClientsToFile(parsed);
    sendJson(res, 200, { status: 'ok' });
  } catch (error) {
    console.error('Ошибка обработки POST /api/clients:', error);
    sendJson(res, 500, { error: 'Не удалось сохранить данные' });
  }
}

async function serveStatic(req, res) {
  try {
    const requestPath = (req.url || '/').split('?')[0];
    let resolvedPath = requestPath === '/' ? '/index.html' : requestPath;
    resolvedPath = path.normalize(resolvedPath).replace(/^\/+/, '');
    let filePath = path.join(DIST_DIR, resolvedPath);

    try {
      const stats = await fsPromises.stat(filePath);
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const data = await fsPromises.readFile(filePath);
    const ext = path.extname(filePath);
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch (error) {
    console.error('Ошибка при выдаче статического файла:', error);
    sendText(res, 404, 'Not found');
  }
}

async function requestListener(req, res) {
  if (!req.url) {
    sendText(res, 400, 'Bad request');
    return;
  }

  if (req.url === '/api/clients' && req.method === 'GET') {
    await handleGetClients(res);
    return;
  }

  if (req.url === '/api/clients' && req.method === 'POST') {
    await handlePostClients(req, res);
    return;
  }

  await serveStatic(req, res);
}

async function start() {
  await initSupabase();
  const server = http.createServer((req, res) => {
    requestListener(req, res).catch((error) => {
      console.error('Необработанная ошибка запроса:', error);
      sendText(res, 500, 'Internal server error');
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Не удалось запустить сервер:', error);
  process.exit(1);
});
