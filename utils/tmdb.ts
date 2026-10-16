// TMDB API (https://developer.themoviedb.org). Uses api.tmdb.org: some Vietnamese networks block
// themoviedb.org, but not this official alternate domain.

const BASE = "https://api.tmdb.org/3";
export const TMDB_IMAGE = "https://image.tmdb.org/t/p";

export const tmdbKey = () => process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || "";
export const tmdbConfigured = () => !!tmdbKey();

export const tmdb = async (path: string, params: Record<string, string | number | undefined> = {}) => {
  const query = new URLSearchParams({ api_key: tmdbKey() });
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && query.set(k, String(v)));
  const res = await fetch(`${BASE}/${path}?${query}`, { signal: AbortSignal.timeout(12000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  return res.json();
};
