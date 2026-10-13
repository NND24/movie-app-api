import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import watchProgressModel from "../models/watchProgress.model";

// Same limit as the client keeps locally.
const LIMIT = 30;
const BATCH_MAX = 50;

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, 1e6) : 0);

const serialize = (p: any) => ({
  slug: p.slug,
  episode: p.episode,
  serverName: p.serverName,
  server: p.server,
  title: p.title,
  originName: p.originName,
  image: p.image,
  position: p.position,
  duration: p.duration,
  exact: p.exact,
  finished: p.finished,
  nextEpisode: p.nextEpisode || undefined,
  totalEpisodes: p.totalEpisodes,
  device: p.device || "",
  updatedAt: new Date(p.updatedAt).getTime(),
});

const userId = (req: Request) => new mongoose.Types.ObjectId(String(req.user?._id));

// GET /progress — the user's latest entries, newest first. serverTime lets clients correct
// for their own clock when comparing timestamps.
export const listProgress = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await watchProgressModel.find({ user: userId(req) }).sort({ updatedAt: -1 }).limit(LIMIT).lean();
    res.json({ items: items.map(serialize), serverTime: Date.now() });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// PUT /progress { items: [...], removed: [slug...] } — saves the given entries (one per movie)
// and deletes the removed ones. Entries carry the time they were made on the device
// (updatedAt, already shifted to server time by the client); an older entry never replaces a newer one.
export const syncProgress = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return next(new ErrorHandler("User not found in request", 400));
    const user = userId(req);
    const items: any[] = Array.isArray(req.body.items) ? req.body.items.slice(0, BATCH_MAX) : [];
    const removed: string[] = Array.isArray(req.body.removed)
      ? req.body.removed.filter((s: unknown) => typeof s === "string").slice(0, BATCH_MAX)
      : [];

    const now = Date.now();
    const ops = items
      .filter((i) => str(i?.slug, 200) && str(i?.episode, 50))
      .map((i) => {
        // Never in the future, so a fast device clock can't freeze an entry.
        const at = new Date(Math.min(now, Number(i.updatedAt) || now));
        return {
          updateOne: {
            // Only replace an entry made earlier (or create it).
            filter: { user, slug: str(i.slug, 200), updatedAt: { $lte: at } },
            update: {
              $set: {
                episode: str(i.episode, 50),
                serverName: str(i.serverName, 200),
                server: str(i.server, 5) || "1",
                title: str(i.title),
                originName: str(i.originName),
                image: str(i.image, 1000),
                position: num(i.position),
                duration: num(i.duration),
                exact: !!i.exact,
                finished: !!i.finished,
                nextEpisode: str(i.nextEpisode, 50),
                totalEpisodes: num(i.totalEpisodes),
                device: str(i.device, 64),
                updatedAt: at,
              },
            },
            upsert: true,
          },
        };
      });

    if (ops.length) {
      try {
        await watchProgressModel.bulkWrite(ops as any, { ordered: false, timestamps: false } as any);
      } catch (error: any) {
        // A duplicate key means a newer entry already exists (the filter didn't match, upsert collided).
        const writeErrors = error?.writeErrors || [];
        if (!writeErrors.length || writeErrors.some((e: any) => (e.code ?? e.err?.code) !== 11000)) throw error;
      }
    }
    if (removed.length) await watchProgressModel.deleteMany({ user, slug: { $in: removed } });

    // Keep only the latest LIMIT entries.
    const stale = await watchProgressModel.find({ user }).sort({ updatedAt: -1 }).skip(LIMIT).select("_id").lean();
    if (stale.length) await watchProgressModel.deleteMany({ _id: { $in: stale.map((s) => s._id) } });

    const latest = await watchProgressModel.find({ user }).sort({ updatedAt: -1 }).limit(LIMIT).lean();
    res.json({ items: latest.map(serialize), serverTime: Date.now() });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});
