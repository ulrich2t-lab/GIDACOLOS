export function readUrlParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  } catch {
    return null;
  }
}

export function updateUrlParams(
  updates: Record<string, string | null | undefined>,
  mode: 'push' | 'replace' = 'replace',
): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;

    for (const [key, value] of Object.entries(updates)) {
      const current = url.searchParams.get(key);
      if (value === null || value === undefined || value === '') {
        if (current !== null) {
          url.searchParams.delete(key);
          changed = true;
        }
      } else if (current !== value) {
        url.searchParams.set(key, value);
        changed = true;
      }
    }

    if (!changed) return;

    const nextRelativeUrl = `${url.pathname}${url.search}${url.hash}`;
    if (mode === 'push') {
      window.history.pushState(null, '', nextRelativeUrl);
    } else {
      window.history.replaceState(null, '', nextRelativeUrl);
    }
  } catch {
    // Ignore restricted History API environments
  }
}

export function readSessionJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeSessionJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function removeSessionKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}
