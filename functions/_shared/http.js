export function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  });
}

export function methodNotAllowed(methods) {
  return new Response(null, {
    status: 405,
    headers: { Allow: methods.join(', ') },
  });
}

export async function readJsonObject(request, maxBytes = 2048) {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && Number(contentLength) > maxBytes) {
    return { response: json({ error: 'request body too large' }, { status: 413 }) };
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return { response: json({ error: 'unable to read request body' }, { status: 400 }) };
  }

  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { response: json({ error: 'request body too large' }, { status: 413 }) };
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { response: json({ error: 'invalid json' }, { status: 400 }) };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { response: json({ error: 'json object required' }, { status: 400 }) };
  }

  return { value };
}

export function parseBoundedInteger(value, { defaultValue, min, max }) {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (!/^\d+$/.test(String(value))) return null;

  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) return null;
  return number;
}
