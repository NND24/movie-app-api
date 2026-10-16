import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import archiveMovieModel, { ArchiveMovie } from "../models/archiveMovie.model";
import { searchKey } from "../utils/searchKey";
import { tmdb, tmdbConfigured } from "../utils/tmdb";
import { COUNTRIES, GENRES, lastSyncReport, syncArchive, syncRunning } from "../utils/archiveSync";

// Internet Archive films in the shape of vsmov's movies, so the client shows them with the same
// cards, detail and watch pages. Lists leave out films vsmov also has: those appear once, as the
// vsmov movie, with the Archive copy as an extra source (GET /catalog/sources/:slug).

type Lang = "vi" | "en";
const langOf = (req: Request): Lang => (req.query.lang === "en" ? "en" : "vi");
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ARCHIVE_SERVER = "Internet Archive";

const toMovie = (d: ArchiveMovie, lang: Lang) => {
  const name = lang === "en" ? d.title?.en || d.originalTitle || "" : d.title?.vi || d.title?.en || d.originalTitle || "";
  const origin = d.originalTitle && d.originalTitle !== name ? d.originalTitle : d.title?.en !== name ? d.title?.en || "" : "";
  const time = d.syncedAt ? new Date(d.syncedAt).toISOString() : "";
  return {
    _id: String(d._id),
    source: "archive",
    slug: d.slug,
    name,
    origin_name: origin,
    content: (lang === "en" ? d.overview?.en || d.overview?.vi : d.overview?.vi || d.overview?.en) || "",
    type: "single",
    status: "completed",
    poster_url: d.poster || d.backdrop || "",
    thumb_url: d.backdrop || d.poster || "",
    trailer_url: "",
    time: d.runtime ? (lang === "en" ? `${d.runtime} min` : `${d.runtime} phút`) : "",
    episode_current: "Full",
    episode_total: "1",
    quality: (d.video?.size || 0) > 7e8 ? "HD" : "SD",
    lang: d.subtitles?.length ? "Engsub" : lang === "en" ? "Original audio" : "Tiếng gốc",
    notify: "",
    showtimes: "",
    year: d.year || 0,
    view: d.downloads || 0,
    actor: d.cast || [],
    director: d.directors || [],
    category: (d.tmdbGenres || [])
      .filter((id) => GENRES[id])
      .map((id) => ({ id: String(id), slug: GENRES[id].slugs[0], name: GENRES[id][lang] })),
    country: (d.countryCodes || [])
      .filter((c) => COUNTRIES[c])
      .map((c) => ({ id: c, slug: COUNTRIES[c].slug, name: COUNTRIES[c][lang] })),
    chieurap: false,
    sub_docquyen: false,
    is_copyright: false,
    tmdb: { type: "movie", id: String(d.tmdbId || ""), season: null, vote_average: Math.round((d.voteAverage || 0) * 10) / 10, vote_count: d.voteCount || 0 },
    imdb: { id: d.imdbId || "" },
    created: { time },
    modified: { time },
  };
};

// The Archive copy as a vsmov-style server with one episode, playable directly as an MP4.
// Subtitle paths are relative to the API (the client adds its API URL).
const toServer = (d: ArchiveMovie, lang: Lang, episodeName = "Full") => ({
  server_name: d.subtitles?.length ? `${ARCHIVE_SERVER} · Engsub` : ARCHIVE_SERVER,
  source: "archive",
  server_data: [
    {
      name: episodeName,
      slug: "full",
      filename: d.title?.en || d.originalTitle || d.identifier,
      link_embed: "",
      link_m3u8: "",
      link_mp4: `https://archive.org/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(d.video?.file || "")}`,
      duration: d.video?.length || (d.runtime || 0) * 60,
      subtitles: (d.subtitles || []).map((s) => ({
        lang: s.lang,
        auto: s.auto,
        label:
          s.lang === "vi"
            ? "Tiếng Việt"
            : lang === "en"
              ? `English${s.auto ? " (auto-generated)" : ""}`
              : `Tiếng Anh${s.auto ? " (tự động)" : ""}`,
        path: `catalog/subtitle/${encodeURIComponent(d.identifier)}?file=${encodeURIComponent(s.file)}`,
      })),
      source_url: `https://archive.org/details/${encodeURIComponent(d.identifier)}`,
    },
  ],
});

const SORTS: Record<string, Record<string, 1 | -1>> = {
  popular: { voteCount: -1, downloads: -1 },
  rating: { voteAverage: -1, voteCount: -1 },
  year: { year: -1, voteCount: -1 },
  oldest: { year: 1, voteCount: -1 },
};

// GET /catalog/archive?genre=&country=&year=&q=&sort=&page=&limit=&lang=
export const listArchiveMovies = CatchAsyncError(async (req: Request, res: Response) => {
  const lang = langOf(req);
  const page = Math.max(1, Math.min(500, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(48, Number(req.query.limit) || 24));
  const filter: Record<string, unknown> = { status: "ready", vsmovSlug: { $exists: false } };
  const genre = String(req.query.genre || "");
  const country = String(req.query.country || "");
  const year = Number(req.query.year) || 0;
  const q = searchKey(String(req.query.q || "")).slice(0, 80);
  if (genre) filter.genres = genre;
  if (country) filter.countries = country;
  if (year) filter.year = year;
  if (q) filter.searchText = { $regex: q.split(" ").map(escapeRegex).join(".*") };
  const sort = SORTS[String(req.query.sort)] || SORTS.popular;
  const [docs, total] = await Promise.all([
    archiveMovieModel.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean<ArchiveMovie[]>(),
    archiveMovieModel.countDocuments(filter),
  ]);
  res.set("Cache-Control", "public, max-age=600");
  res.json({
    items: docs.map((d) => toMovie(d, lang)),
    pagination: { totalItems: total, totalItemsPerPage: limit, currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

// GET /catalog/archive/:slug -> { movie, episodes } like vsmov's /phim/:slug.
export const getArchiveMovie = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const doc = await archiveMovieModel.findOne({ slug: String(req.params.slug), status: "ready" }).lean<ArchiveMovie>();
  if (!doc) return next(new ErrorHandler("Không tìm thấy phim này", 404));
  const lang = langOf(req);
  res.set("Cache-Control", "public, max-age=600");
  res.json({ status: true, movie: toMovie(doc, lang), episodes: [toServer(doc, lang)] });
});

// GET /catalog/sources/:slug?episode= — asked by the client for every movie page, next to vsmov:
//  - a vsmov movie with an Archive copy -> { episodes: [the copy as a server] }
//  - an Archive-only film's slug        -> { movie, episodes } (what vsmov would return)
//  - otherwise                          -> { episodes: [] }
export const getArchiveSources = CatchAsyncError(async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const lang = langOf(req);
  res.set("Cache-Control", "public, max-age=600");
  const linked = await archiveMovieModel.findOne({ vsmovSlug: slug, status: "ready" }).lean<ArchiveMovie>();
  if (linked) {
    // Named like the vsmov movie's episode, so switching sources keeps the episode.
    const episode = String(req.query.episode || "Full").slice(0, 40);
    return res.json({ episodes: [toServer(linked, lang, episode)] });
  }
  const own = await archiveMovieModel.findOne({ slug, status: "ready", vsmovSlug: { $exists: false } }).lean<ArchiveMovie>();
  res.json(own ? { movie: toMovie(own, lang), episodes: [toServer(own, lang)] } : { episodes: [] });
});

// Subtitles from the item, as WebVTT (what <track> plays), from this origin (Archive's file
// downloads send no CORS headers).
const vttCache = new Map<string, string>();
const srtToVtt = (srt: string) =>
  "WEBVTT\n\n" +
  srt
    .replace(/^﻿/, "")
    .replace(/\r/g, "")
    .replace(/^WEBVTT[^\n]*\n+/, "")
    // WebVTT wants hh:mm:ss.mmm; auto-generated files write "0:01:01,95".
    .replace(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/g, (_, h, m, s, ms) => `${h.padStart(2, "0")}:${m}:${s}.${ms.padEnd(3, "0")}`)
    .trim() +
  "\n";

export const getSubtitle = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const identifier = String(req.params.identifier);
  const file = String(req.query.file || "");
  const doc = await archiveMovieModel.findOne({ identifier, status: "ready" }, { subtitles: 1 }).lean<ArchiveMovie>();
  if (!doc || !doc.subtitles?.some((s) => s.file === file)) return next(new ErrorHandler("Không tìm thấy phụ đề", 404));
  const key = `${identifier}/${file}`;
  let vtt = vttCache.get(key);
  if (!vtt) {
    const r = await fetch(`https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file)}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return next(new ErrorHandler("Không tải được phụ đề", 502));
    vtt = srtToVtt(await r.text());
    if (vttCache.size > 200) vttCache.delete(vttCache.keys().next().value as string);
    vttCache.set(key, vtt);
  }
  res.set("Content-Type", "text/vtt; charset=utf-8");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(vtt);
});

// GET /catalog/titles?keys=movie:653,tv:1399&lang=en -> { "movie:653": { title, overview } }
// Titles and descriptions of vsmov movies (which carry TMDB ids) in another language, for the
// English interface. Cached; at most 60 keys per call.
const titleCache = new Map<string, { at: number; title: string; overview: string } | null>();
const TITLE_TTL = 7 * 24 * 3600 * 1000;
export const getTitles = CatchAsyncError(async (req: Request, res: Response) => {
  const lang = req.query.lang === "vi" ? "vi-VN" : "en-US";
  const keys = [...new Set(String(req.query.keys || "").split(","))].filter((k) => /^(movie|tv):\d{1,9}$/.test(k)).slice(0, 60);
  const out: Record<string, { title: string; overview: string }> = {};
  const missing: string[] = [];
  for (const key of keys) {
    const hit = titleCache.get(`${lang}|${key}`);
    if (hit !== undefined && (hit === null || Date.now() - hit.at < TITLE_TTL)) {
      if (hit) out[key] = { title: hit.title, overview: hit.overview };
    } else missing.push(key);
  }
  if (missing.length && tmdbConfigured()) {
    const queue = [...missing];
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (let key = queue.shift(); key; key = queue.shift()) {
          const [type, id] = key.split(":");
          const d = await tmdb(`${type}/${id}`, { language: lang }).catch(() => undefined);
          if (d === undefined) continue; // network error: try again next time
          const value = d ? { at: Date.now(), title: (type === "tv" ? d.name : d.title) || "", overview: (d.overview || "").trim() } : null;
          if (titleCache.size > 20000) titleCache.delete(titleCache.keys().next().value as string);
          titleCache.set(`${lang}|${key}`, value);
          if (value) out[key] = { title: value.title, overview: value.overview };
        }
      })
    );
  }
  res.set("Cache-Control", "public, max-age=86400");
  res.json(out);
});

// POST /catalog/sync — runs a sync batch (header x-cron-secret = CRON_SECRET). Returns at once;
// GET /catalog/sync shows the progress.
export const startSync = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers["x-cron-secret"] !== secret) return next(new ErrorHandler("Forbidden", 401));
  const batch = Math.max(1, Math.min(500, Number(req.query.batch) || 0)) || undefined;
  const already = syncRunning();
  syncArchive(batch).catch(() => undefined);
  res.status(202).json({ started: !already, running: true });
});

export const syncStatus = CatchAsyncError(async (_req: Request, res: Response) => {
  const [ready, skipped, linked] = await Promise.all([
    archiveMovieModel.countDocuments({ status: "ready" }),
    archiveMovieModel.countDocuments({ status: "skipped" }),
    archiveMovieModel.countDocuments({ status: "ready", vsmovSlug: { $exists: true } }),
  ]);
  res.json({ running: syncRunning(), last: lastSyncReport(), ready, skipped, linkedToVsmov: linked });
});
