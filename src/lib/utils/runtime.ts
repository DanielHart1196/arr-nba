import { Capacitor } from '@capacitor/core';

const DEFAULT_API_ORIGIN = 'https://arr-nba.pages.dev';

function normalizePath(path: string): string {
  if (!path) return '/';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

export function isNativeRuntime(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (typeof Capacitor?.isNativePlatform === 'function') {
      return Capacitor.isNativePlatform();
    }
  } catch {
    // Ignore and fall back to origin check.
  }
  return typeof window !== 'undefined' && window.location?.origin === 'capacitor://localhost';
}

export function resolveApiUrl(path: string): string {
  const normalized = normalizePath(path);
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  const apiOrigin = (import.meta.env.PUBLIC_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, '');
  return isNativeRuntime() ? `${apiOrigin}${normalized}` : normalized;
}
