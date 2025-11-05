const rawBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const API_BASE = rawBase.replace(/\/$/, '');

function buildUrl(path) {
  if (!path.startsWith('/')) {
    throw new Error('API path должен начинаться с "/"');
  }
  return `${API_BASE}${path}`;
}

async function handleResponse(response) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Ошибка ${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export async function fetchClientsFromApi() {
  const url = buildUrl('/api/clients');
  const response = await fetch(url, { method: 'GET', credentials: 'same-origin' });
  return handleResponse(response);
}

export async function persistClients(clients) {
  const url = buildUrl('/api/clients');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(clients),
  });
  return handleResponse(response);
}
