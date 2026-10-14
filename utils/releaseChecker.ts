// Periodic check for new episodes of followed movies and new chapters of followed manga, sent as
// Web Push notifications to the followers' devices. Runs in the server process every
// RELEASE_CHECK_MINUTES (default 30), and on demand (cron endpoint / admin), since a free host
// may sleep and skip timers.
import pushSubscriptionModel from "../models/pushSubscription.model";
import releaseSnapshotModel from "../models/releaseSnapshot.model";
import userModel from "../models/user.model";
import { pushConfigured, sendToUser } from "./push";

const MOVIE_API = "https://vsmov.com/api";
const MANGA_API = "https://api.mangadex.org";
const MAX_MOVIES_PER_RUN = 300;
const MAX_MANGA_PER_RUN = 150;
const CONCURRENCY = 3;
const TIMEOUT_MS = 10000;

const getJson = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "dMovie/1.0 (release notifications)" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
};

// Runs fn over items, a few at a time.
const pool = async <T>(items: T[], fn: (item: T) => Promise<void>) => {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        try {
          await fn(item);
        } catch (error: any) {
          console.warn("[releases]", error?.message || error);
        }
      }
    })
  );
};

const episodeLabel = (name: string) => (/^\d+$/.test(name) ? `Tập ${name}` : name);

export interface CheckReport {
  ranAt: Date;
  movies: number;
  manga: number;
  newReleases: number;
  notified: number;
  skipped?: string;
}

let running: Promise<CheckReport> | null = null;
let lastReport: CheckReport | null = null;
export const lastCheckReport = () => lastReport;

const runCheck = async (): Promise<CheckReport> => {
  const report: CheckReport = { ranAt: new Date(), movies: 0, manga: 0, newReleases: 0, notified: 0 };
  if (!pushConfigured()) return { ...report, skipped: "VAPID keys missing" };

  // Only users with at least one device subscribed.
  const userIds = await pushSubscriptionModel.distinct("user");
  if (!userIds.length) return { ...report, skipped: "no subscriptions" };
  const users = await userModel.find({ _id: { $in: userIds }, banned: { $ne: true } }).select("followedMovie followedManga").lean();

  const movieFollowers = new Map<string, string[]>();
  const mangaFollowers = new Map<string, { users: string[]; title: string; cover: string }>();
  users.forEach((u: any) => {
    (u.followedMovie || []).forEach((slug: string) => movieFollowers.set(slug, [...(movieFollowers.get(slug) || []), String(u._id)]));
    (u.followedManga || []).forEach((m: any) => {
      const entry = mangaFollowers.get(m.manga_id) || { users: [] as string[], title: m.title, cover: m.cover };
      entry.users.push(String(u._id));
      mangaFollowers.set(m.manga_id, entry);
    });
  });

  const notify = async (ids: string[], payload: Parameters<typeof sendToUser>[1]) => {
    report.newReleases += 1;
    const sent = await Promise.all(ids.map((id) => sendToUser(id, payload)));
    report.notified += sent.reduce((a, b) => a + b, 0);
  };

  await pool([...movieFollowers.keys()].slice(0, MAX_MOVIES_PER_RUN), async (slug) => {
    const data = await getJson(`${MOVIE_API}/phim/${encodeURIComponent(slug)}`);
    const movie = data?.movie;
    if (!movie) return;
    report.movies += 1;
    const servers: { server_data?: { name: string }[] }[] = data.episodes || [];
    const longest = servers.reduce<{ name: string }[]>((best, s) => ((s.server_data?.length || 0) > best.length ? s.server_data || [] : best), []);
    const count = longest.length;
    const newest = longest[count - 1]?.name || "";
    const snap = await releaseSnapshotModel.findOne({ kind: "movie", key: slug });
    // The first look only records the state; later looks compare with it.
    if (snap && count > snap.count && newest) {
      await notify(movieFollowers.get(slug) || [], {
        title: `${movie.name} có tập mới`,
        body: `${episodeLabel(newest)} đã lên sóng${count - snap.count > 1 ? ` (+${count - snap.count} tập)` : ""}. Xem ngay trên dMovie!`,
        url: `/phim/${slug}/${encodeURIComponent(newest)}`,
        image: typeof movie.poster_url === "string" ? movie.poster_url : undefined,
        tag: `movie:${slug}`,
      });
    }
    await releaseSnapshotModel.updateOne(
      { kind: "movie", key: slug },
      { $set: { count, latest: newest, latestLabel: episodeLabel(newest), checkedAt: new Date() } },
      { upsert: true }
    );
  });

  await pool([...mangaFollowers.keys()].slice(0, MAX_MANGA_PER_RUN), async (id) => {
    const params = new URLSearchParams({ limit: "1", "order[readableAt]": "desc" });
    ["vi", "en"].forEach((l) => params.append("translatedLanguage[]", l));
    ["safe", "suggestive", "erotica"].forEach((r) => params.append("contentRating[]", r));
    const data = await getJson(`${MANGA_API}/manga/${id}/feed?${params}`);
    const chapter = data?.data?.[0];
    if (!chapter) return;
    report.manga += 1;
    const a = chapter.attributes || {};
    const label = [a.chapter ? `Chương ${a.chapter}` : "Chương mới", a.title].filter(Boolean).join(": ");
    const snap = await releaseSnapshotModel.findOne({ kind: "manga", key: id });
    if (snap && snap.latest && snap.latest !== chapter.id) {
      const info = mangaFollowers.get(id)!;
      await notify(info.users, {
        title: `${info.title || "Truyện bạn theo dõi"} có chương mới`,
        body: `${label}${a.translatedLanguage ? ` (${String(a.translatedLanguage).toUpperCase()})` : ""}. Đọc ngay trên dMovie!`,
        url: `/truyen/doc/${chapter.id}`,
        image: info.cover || undefined,
        tag: `manga:${id}`,
      });
    }
    await releaseSnapshotModel.updateOne(
      { kind: "manga", key: id },
      { $set: { latest: chapter.id, latestLabel: label, checkedAt: new Date() } },
      { upsert: true }
    );
  });

  return report;
};

// One check at a time; a call during a run gets that run's result.
export const checkReleases = () => {
  if (!running) {
    running = runCheck()
      .then((r) => {
        lastReport = r;
        if (r.newReleases || r.skipped !== "no subscriptions") console.log("[releases]", JSON.stringify(r));
        return r;
      })
      .finally(() => {
        running = null;
      });
  }
  return running;
};

export const startReleaseChecker = () => {
  const minutes = Math.max(5, Number(process.env.RELEASE_CHECK_MINUTES) || 30);
  // First run shortly after start-up (the database connects asynchronously).
  setTimeout(() => checkReleases().catch(() => undefined), 60 * 1000);
  setInterval(() => checkReleases().catch(() => undefined), minutes * 60 * 1000);
};
