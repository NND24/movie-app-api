import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";

// Movies of an actor or director. vsmov's API has no such list (and its search ignores cast
// names), but its website has a page per person: /dien-vien/<slug> and /dao-dien/<slug>, 20 movies
// per page. This reads that page and returns the movie slugs; the client loads each movie's details.

const SITE = "https://vsmov.com";
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE = 500;
const TIMEOUT_MS = 12000;

interface PersonPage {
  name: string;
  slugs: string[];
  page: number;
  totalPages: number;
}

const cache = new Map<string, { at: number; data: PersonPage }>();

const decodeHtml = (text: string) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

export const parsePersonPage = (html: string, page: number): PersonPage => {
  const name = decodeHtml(html.match(/<h1[^>]*>([^<]+)/)?.[1] || "");
  const slugs = [...new Set([...html.matchAll(/href="https:\/\/vsmov\.com\/phim\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
  const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]));
  return { name, slugs, page, totalPages: Math.max(page, ...pages, 1) };
};

// GET /people/:role/:slug?page=  (role: actor | director)
export const getPersonMovies = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.params.role === "director" ? "director" : req.params.role === "actor" ? "actor" : null;
    const slug = String(req.params.slug || "").toLowerCase();
    const page = Math.max(1, Math.min(200, Number(req.query.page) || 1));
    if (!role || !/^[a-z0-9-]{1,120}$/.test(slug)) return next(new ErrorHandler("Không tìm thấy", 404));

    const key = `${role}:${slug}:${page}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.json(hit.data);

    const path = role === "director" ? "dao-dien" : "dien-vien";
    const response = await fetch(`${SITE}/${path}/${slug}${page > 1 ? `?page=${page}` : ""}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; dMovie/1.0)" },
    });
    if (response.status === 404) return next(new ErrorHandler("Không tìm thấy diễn viên này", 404));
    if (!response.ok) return next(new ErrorHandler("Nguồn phim không phản hồi", 502));
    const data = parsePersonPage(await response.text(), page);

    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), data });
    res.set("Cache-Control", "public, max-age=3600");
    res.json(data);
  } catch (error: any) {
    next(new ErrorHandler(error?.name === "TimeoutError" ? "Nguồn phim phản hồi quá chậm" : error.message, 502));
  }
});
