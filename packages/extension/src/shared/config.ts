const rawBackendUrl =
  import.meta.env.VITE_BACKEND_URL ?? 'https://hscan-agent-helper-production.up.railway.app';

const absoluteBackendUrl = /^https?:\/\//.test(rawBackendUrl)
  ? rawBackendUrl
  : `https://${rawBackendUrl}`;

export const BACKEND_URL = absoluteBackendUrl.replace(/\/$/, '');
