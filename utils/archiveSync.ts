// Brings Internet Archive feature films into the catalog (models/archiveMovie.model.ts): lists the
// collection, keeps films that TMDB knows (for titles and descriptions in Vietnamese and English,
// genres, posters), that have a playable MP4 of the film's length, and that are old enough to be in
// the public domain (or carry an open license); then links each to the same film on vsmov, if any.
// Runs a batch in the server process every ARCHIVE_SYNC_MINUTES (default 180) and on demand.

import archiveMovieModel from "../models/archiveMovie.model";
import { TMDB_IMAGE, tmdb, tmdbConfigured } from "./tmdb";
import { searchKey } from "./searchKey";

const ARCHIVE = "https://archive.org";
const VSMOV = "https://vsmov.com/api";
const MIN_DOWNLOADS = 3000;
const BATCH = Number(process.env.ARCHIVE_SYNC_BATCH) || 200;
// Films from before this year are taken as public domain (most Archive feature films are); newer
// ones only with an open license on the item.
const PUBLIC_DOMAIN_BEFORE = 1980;
const MIN_MINUTES = 40;

const UA = { "user-agent": "dMovie/1.0 (catalog sync; https://dmovie-seven.vercel.app)" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url: string) => {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url.slice(0, 80)} -> ${res.status}`);
  return res.json();
};

// TMDB genre id -> the app's (vsmov's) genre slugs.
export const GENRES: Record<number, { slugs: string[]; vi: string; en: string }> = {
  28: { slugs: ["hanh-dong"], vi: "Hành Động", en: "Action" },
  12: { slugs: ["phieu-luu"], vi: "Phiêu Lưu", en: "Adventure" },
  16: { slugs: ["hoat-hinh"], vi: "Hoạt Hình", en: "Animation" },
  35: { slugs: ["hai"], vi: "Hài", en: "Comedy" },
  80: { slugs: ["hinh-su", "toi-pham"], vi: "Hình Sự", en: "Crime" },
  99: { slugs: ["tai-lieu"], vi: "Tài Liệu", en: "Documentary" },
  18: { slugs: ["chinh-kich", "drama"], vi: "Chính Kịch", en: "Drama" },
  10751: { slugs: ["gia-dinh"], vi: "Gia Đình", en: "Family" },
  14: { slugs: ["gia-tuong"], vi: "Giả Tưởng", en: "Fantasy" },
  36: { slugs: ["lich-su"], vi: "Lịch Sử", en: "History" },
  27: { slugs: ["kinh-di"], vi: "Kinh Dị", en: "Horror" },
  10402: { slugs: ["phim-nhac"], vi: "Phim Nhạc", en: "Music" },
  9648: { slugs: ["bi-an"], vi: "Bí Ẩn", en: "Mystery" },
  10749: { slugs: ["lang-man"], vi: "Lãng Mạn", en: "Romance" },
  878: { slugs: ["khoa-hoc-vien-tuong", "vien-tuong"], vi: "Khoa Học Viễn Tưởng", en: "Science Fiction" },
  53: { slugs: ["giat-gan"], vi: "Giật Gân", en: "Thriller" },
  10752: { slugs: ["chien-tranh"], vi: "Chiến Tranh", en: "War" },
  37: { slugs: ["mien-tay"], vi: "Miền Tây", en: "Western" },
};

// ISO country -> the app's country slugs ("au-my" covers American and European films).
const WESTERN = new Set(["US", "GB", "CA", "AU", "NZ", "IE", "FR", "DE", "IT", "ES", "SE", "DK", "NO", "FI", "NL", "BE", "AT", "CH", "PL", "CZ", "HU", "PT", "GR", "RU", "SU", "MX"]);
export const COUNTRIES: Record<string, { slug: string; vi: string; en: string }> = {
  US: { slug: "my", vi: "Mỹ", en: "United States" },
  GB: { slug: "anh", vi: "Anh", en: "United Kingdom" },
  FR: { slug: "phap", vi: "Pháp", en: "France" },
  DE: { slug: "duc", vi: "Đức", en: "Germany" },
  IT: { slug: "y", vi: "Ý", en: "Italy" },
  ES: { slug: "tay-ban-nha", vi: "Tây Ban Nha", en: "Spain" },
  SE: { slug: "thuy-dien", vi: "Thụy Điển", en: "Sweden" },
  DK: { slug: "dan-mach", vi: "Đan Mạch", en: "Denmark" },
  RU: { slug: "nga", vi: "Nga", en: "Russia" },
  SU: { slug: "nga", vi: "Nga", en: "Soviet Union" },
  JP: { slug: "nhat-ban", vi: "Nhật Bản", en: "Japan" },
  CN: { slug: "trung-quoc", vi: "Trung Quốc", en: "China" },
  HK: { slug: "hong-kong", vi: "Hồng Kông", en: "Hong Kong" },
  KR: { slug: "han-quoc", vi: "Hàn Quốc", en: "South Korea" },
  IN: { slug: "an-do", vi: "Ấn Độ", en: "India" },
  CA: { slug: "canada", vi: "Canada", en: "Canada" },
  AU: { slug: "uc", vi: "Úc", en: "Australia" },
  MX: { slug: "mexico", vi: "Mexico", en: "Mexico" },
  NL: { slug: "ha-lan", vi: "Hà Lan", en: "Netherlands" },
};
export const countrySlugs = (codes: string[]) => {
  const slugs = codes.map((c) => COUNTRIES[c]?.slug).filter(Boolean) as string[];
  if (codes.some((c) => WESTERN.has(c))) slugs.unshift("au-my");
  return [...new Set(slugs)];
};

const norm = (t = "") =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, "");

export const slugify = (t = "") =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// "His Girl Friday (1940) - Full Movie [HD]" -> "His Girl Friday".
const cleanTitle = (t = "") =>
  t
    .replace(/[_.]+/g, " ")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\b(19|20)\d\d\b/g, " ")
    .replace(/\b(full movie|full film|feature film|public domain|hd|sd|1080p|720p|480p|colorized|restored|dvd ?rip|vhs ?rip|goofy ?rip)\b/gi, " ")
    .replace(/\s+-\s*$|^\s*-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Candidate {
  identifier: string;
  title?: string;
  year?: number | string;
  downloads?: number;
}

// The collection, most downloaded first (scrape API, cursor paging).
const listCandidates = async (known: Set<string>, want: number): Promise<Candidate[]> => {
  const out: Candidate[] = [];
  let cursor: string | undefined;
  const q = `collection:feature_films AND mediatype:movies AND downloads:[${MIN_DOWNLOADS} TO *]`;
  for (let page = 0; page < 40 && out.length < want; page++) {
    const params = new URLSearchParams({ q, fields: "identifier,title,year,downloads", count: "1000", sorts: "downloads desc" });
    if (cursor) params.set("cursor", cursor);
    const d = await getJson(`${ARCHIVE}/services/search/v1/scrape?${params}`);
    for (const item of d.items || []) if (!known.has(item.identifier)) out.push(item);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out.slice(0, want);
};

// The film's MP4 (not a trailer or sample) and subtitle files of an item.
const pickFiles = (files: any[]) => {
  const mp4s = files
    .filter((f) => /\.mp4$/i.test(f.name) && !/trailer|sample|preview/i.test(f.name))
    .map((f) => ({ file: f.name as string, length: parseLength(f.length), size: Number(f.size) || 0, low: /512kb/i.test(f.name) }));
  // Prefer the full-quality derivative when it isn't huge, else the 512kb one.
  const good = mp4s.filter((m) => !m.low && m.size > 0 && m.size < 2.5e9).sort((a, b) => b.length - a.length)[0];
  const low = mp4s.filter((m) => m.low).sort((a, b) => b.length - a.length)[0];
  const video = good || low || mp4s[0];
  const subtitles = files
    .filter((f) => /\.(srt|vtt)$/i.test(f.name))
    .map((f) => {
      const name = String(f.name);
      const lang = /(^|[._-])(vi|vie|vietnamese)([._-]|$)/i.test(name) ? "vi" : "en";
      return { file: name, lang, auto: /\.asr\./i.test(name) };
    });
  return { video, subtitles };
};

// "1:28:03", "5283.4" -> seconds.
const parseLength = (v: unknown) => {
  if (!v) return 0;
  const s = String(v);
  if (s.includes(":")) return s.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
  return Number(s) || 0;
};

// TMDB film for an Archive item: by IMDb id, else by title and year (exact title only).
const findTmdbMovie = async (title: string, year: number | undefined, imdbId?: string) => {
  if (imdbId) {
    const found = await tmdb(`find/${imdbId}`, { external_source: "imdb_id" });
    if (found?.movie_results?.[0]) return found.movie_results[0];
  }
  const wanted = norm(title);
  if (wanted.length < 2) return null;
  const exact = (results: any[]) => results.filter((r) => norm(r.title) === wanted || norm(r.original_title) === wanted);
  if (year) {
    const withYear = exact((await tmdb("search/movie", { query: title, year }))?.results || []);
    if (withYear[0]) return withYear[0];
    const near = exact((await tmdb("search/movie", { query: title }))?.results || []).find(
      (r) => Math.abs(Number(String(r.release_date).slice(0, 4)) - year) <= 1
    );
    if (near) return near;
  }
  // Archive "year" is sometimes the upload year: accept a single old film with that exact title.
  const any = exact((await tmdb("search/movie", { query: title }))?.results || []).filter((r) => Number(String(r.release_date).slice(0, 4)) < PUBLIC_DOMAIN_BEFORE);
  return any.length === 1 ? any[0] : null;
};

// The same film on vsmov (its search finds original titles; compare TMDB ids).
const findOnVsmov = async (tmdbId: number, titles: string[]) => {
  for (const title of [...new Set(titles.filter(Boolean))].slice(0, 2)) {
    const d = await getJson(`${VSMOV}/tim-kiem?keyword=${encodeURIComponent(title)}&limit=20`).catch(() => null);
    const hit = (d?.items || []).find((m: any) => Number(m?.tmdb?.id) === tmdbId && (m?.tmdb?.type || "movie") === "movie");
    if (hit) return hit.slug as string;
    await sleep(300);
  }
  return undefined;
};

const skip = (identifier: string, reason: string, downloads = 0) =>
  archiveMovieModel.updateOne(
    { identifier },
    { $set: { identifier, status: "skipped", skipReason: reason, downloads, syncedAt: new Date() } },
    { upsert: true }
  );

const uniqueSlug = async (base: string, identifier: string) => {
  let slug = base;
  for (let i = 2; await archiveMovieModel.exists({ slug, identifier: { $ne: identifier } }); i++) slug = `${base}-${i}`;
  return slug;
};

// One Archive item -> "ready" (usable) or "skipped" (with the reason).
export const syncItem = async (c: Candidate) => {
  const meta = await getJson(`${ARCHIVE}/metadata/${encodeURIComponent(c.identifier)}`);
  const md = meta.metadata || {};
  const downloads = Number(c.downloads || meta.item?.downloads) || 0;
  const { video, subtitles } = pickFiles(meta.files || []);
  if (!video) return skip(c.identifier, "no mp4", downloads);

  const imdbId = JSON.stringify(md).match(/tt\d{7,8}/)?.[0];
  const title = cleanTitle(String(Array.isArray(md.title) ? md.title[0] : md.title || c.title || ""));
  const archiveYear = Number(String(md.year || md.date || c.year || "").slice(0, 4)) || undefined;
  const found = await findTmdbMovie(title, archiveYear, imdbId);
  if (!found) return skip(c.identifier, "not on tmdb", downloads);

  const [vi, en] = await Promise.all([
    tmdb(`movie/${found.id}`, { language: "vi-VN", append_to_response: "credits" }),
    tmdb(`movie/${found.id}`, { language: "en-US" }),
  ]);
  if (!vi || !en || vi.adult) return skip(c.identifier, "tmdb details", downloads);
  const year = Number(String(vi.release_date || "").slice(0, 4)) || undefined;
  const license = String(md.licenseurl || "");
  if (!(year && year < PUBLIC_DOMAIN_BEFORE) && !/publicdomain|creativecommons/i.test(license)) return skip(c.identifier, "maybe copyrighted", downloads);
  const runtime = Number(vi.runtime) || 0;
  const minutes = video.length / 60;
  if (minutes && minutes < MIN_MINUTES) return skip(c.identifier, "too short", downloads);
  // A file much shorter than the film is a clip or a partial upload.
  if (runtime && minutes && minutes < runtime * 0.6) return skip(c.identifier, "partial video", downloads);
  if (!minutes && runtime && runtime < MIN_MINUTES) return skip(c.identifier, "too short", downloads);

  const tmdbGenres: number[] = (vi.genres || []).map((g: any) => g.id);
  const countryCodes: string[] = (vi.production_countries || []).map((p: any) => p.iso_3166_1);
  const enTitle = en.title || vi.original_title || title;
  const viTitle = vi.title && vi.title !== vi.original_title ? vi.title : "";
  // One entry per film: several uploads of it keep the one with subtitles, else the most
  // downloaded (candidates come most downloaded first), and its slug for stable links.
  const existing = await archiveMovieModel.findOne({ tmdbId: found.id, status: "ready", identifier: { $ne: c.identifier } }).lean();
  if (existing) {
    if (existing.subtitles?.length || !subtitles.length) return skip(c.identifier, "duplicate", downloads);
    await archiveMovieModel.updateOne({ _id: existing._id }, { $set: { status: "skipped", skipReason: "duplicate" }, $unset: { slug: "" } });
  }
  const vsmovSlug = existing?.vsmovSlug || (await findOnVsmov(found.id, [vi.original_title, enTitle]));
  const slug = existing?.slug || (await uniqueSlug(`${slugify(enTitle)}-${year || "phim"}`, c.identifier));

  await archiveMovieModel.updateOne(
    { identifier: c.identifier },
    {
      $set: {
        identifier: c.identifier,
        status: "ready",
        slug,
        tmdbId: found.id,
        imdbId: vi.imdb_id || imdbId,
        title: { vi: viTitle, en: enTitle },
        originalTitle: vi.original_title,
        overview: { vi: (vi.overview || "").trim(), en: (en.overview || "").trim() },
        poster: vi.poster_path || en.poster_path ? `${TMDB_IMAGE}/w500${vi.poster_path || en.poster_path}` : undefined,
        backdrop: vi.backdrop_path ? `${TMDB_IMAGE}/w1280${vi.backdrop_path}` : undefined,
        year,
        runtime: runtime || Math.round(minutes) || undefined,
        genres: [...new Set(tmdbGenres.flatMap((id) => GENRES[id]?.slugs || []))],
        tmdbGenres,
        countries: countrySlugs(countryCodes),
        countryCodes,
        directors: (vi.credits?.crew || []).filter((p: any) => p.job === "Director").map((p: any) => p.name).slice(0, 3),
        cast: (vi.credits?.cast || []).slice(0, 8).map((p: any) => p.name),
        voteAverage: vi.vote_average || 0,
        voteCount: vi.vote_count || 0,
        downloads,
        video,
        subtitles,
        vsmovSlug,
        searchText: searchKey([viTitle, enTitle, vi.original_title, title].join(" ")),
        syncedAt: new Date(),
      },
      $unset: { skipReason: "" },
    },
    { upsert: true }
  );
};

export interface SyncReport {
  ranAt: Date;
  checked: number;
  added: number;
  skipped: number;
  errors: number;
  total: number;
  note?: string;
}

let running: Promise<SyncReport> | null = null;
let lastReport: SyncReport | null = null;
export const lastSyncReport = () => lastReport;

const runSync = async (batch: number): Promise<SyncReport> => {
  const report: SyncReport = { ranAt: new Date(), checked: 0, added: 0, skipped: 0, errors: 0, total: 0 };
  if (!tmdbConfigured()) return { ...report, note: "TMDB_API_KEY missing" };
  const known = new Set((await archiveMovieModel.find({}, { identifier: 1 }).lean()).map((d) => d.identifier));
  const candidates = await listCandidates(known, batch);
  for (const c of candidates) {
    report.checked++;
    try {
      await syncItem(c);
      const doc = await archiveMovieModel.findOne({ identifier: c.identifier }, { status: 1 }).lean();
      if (doc?.status === "ready") report.added++;
      else report.skipped++;
    } catch (error: any) {
      report.errors++;
      console.warn("[archive]", c.identifier, error?.message || error);
    }
    // Be gentle with archive.org.
    await sleep(400);
  }
  report.total = await archiveMovieModel.countDocuments({ status: "ready" });
  if (!candidates.length) report.note = "nothing new";
  return report;
};

export const syncArchive = (batch = BATCH) => {
  if (!running) {
    running = runSync(batch)
      .then((r) => (lastReport = r))
      .finally(() => (running = null));
  }
  return running;
};
export const syncRunning = () => !!running;

export const startArchiveSync = () => {
  if (!tmdbConfigured()) {
    console.log("[archive] TMDB_API_KEY not set: Internet Archive films are not synced");
    return;
  }
  const minutes = Number(process.env.ARCHIVE_SYNC_MINUTES) || 180;
  const run = () =>
    syncArchive().then(
      (r) => r.checked && console.log(`[archive] +${r.added} films (${r.skipped} skipped, ${r.errors} errors), ${r.total} in catalog`),
      (e) => console.warn("[archive] sync failed:", e?.message || e)
    );
  setTimeout(run, 60 * 1000);
  setInterval(run, minutes * 60 * 1000);
};
