let _token: string | null = null;

export function setToken(t: string | null) { _token = t; }
export function getToken() { return _token; }

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(path, { ...options, headers, credentials: "include" });

  if (!res.ok) {
    let errData: { error?: string } = {};
    try { errData = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, errData.error ?? res.statusText, errData);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function apiGet<T = unknown>(path: string) {
  return apiFetch<T>(path);
}

export function apiPost<T = unknown>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T = unknown>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T = unknown>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T = unknown>(path: string) {
  return apiFetch<T>(path, { method: "DELETE" });
}
