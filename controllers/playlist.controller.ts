import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import playlistModel, { Playlist, PLAYLIST_LIMITS } from "../models/playlist.model";
import userModel from "../models/user.model";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isId = (v: unknown): v is string => typeof v === "string" && mongoose.isValidObjectId(v);
const visibilityOf = (v: unknown) => (v === "link" ? "link" : "private");
const uid = (req: Request) => String(req.user?._id || "");

// Summary for list views: a few covers instead of every item.
const summary = (p: any, slug?: string) => ({
  _id: String(p._id),
  name: p.name,
  description: p.description,
  visibility: p.visibility,
  count: p.items.length,
  covers: p.items.slice(0, 4).map((i: any) => i.thumb || i.poster).filter(Boolean),
  // Whether the given movie is in this list (for the "add to list" menu).
  hasMovie: slug ? p.items.some((i: any) => i.slug === slug) : undefined,
  updatedAt: p.updatedAt,
});

const full = async (p: any, viewerId: string) => {
  const owner = await userModel.findById(p.owner).select("name avatar").lean();
  return {
    ...summary(p),
    items: p.items,
    createdAt: p.createdAt,
    owner: { _id: String(p.owner), name: (owner as any)?.name || "Người dùng", avatar: (owner as any)?.avatar },
    isOwner: viewerId === String(p.owner),
  };
};

const itemFrom = (movie: any) => {
  const slug = str(movie?.slug, 200);
  if (!slug) return null;
  return {
    slug,
    name: str(movie.name, 300),
    originName: str(movie.originName ?? movie.origin_name, 300),
    poster: str(movie.poster ?? movie.poster_url, 1000),
    thumb: str(movie.thumb ?? movie.thumb_url, 1000),
    year: Number(movie.year) || 0,
    episodeCurrent: str(movie.episodeCurrent ?? movie.episode_current, 100),
    type: str(movie.type, 30),
    addedAt: new Date(),
  };
};

// The caller's own playlist, or an error response.
const ownPlaylist = async (req: Request, next: NextFunction): Promise<Playlist | null> => {
  if (!isId(req.params.id)) {
    next(new ErrorHandler("Không tìm thấy danh sách", 404));
    return null;
  }
  const playlist = await playlistModel.findOne({ _id: req.params.id, owner: req.user?._id });
  if (!playlist) next(new ErrorHandler("Không tìm thấy danh sách", 404));
  return playlist;
};

// GET /playlists?slug= — the caller's playlists, most recently changed first.
export const listMyPlaylists = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = str(req.query.slug, 200) || undefined;
    const lists = await playlistModel.find({ owner: req.user?._id }).sort({ updatedAt: -1 }).lean();
    res.json({ playlists: lists.map((p) => summary(p, slug)) });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// POST /playlists { name, description?, visibility?, movie? } — movie is added right away.
export const createPlaylist = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = str(req.body.name, PLAYLIST_LIMITS.name);
    if (!name) return next(new ErrorHandler("Hãy đặt tên cho danh sách", 400));
    const count = await playlistModel.countDocuments({ owner: req.user?._id });
    if (count >= PLAYLIST_LIMITS.perUser) return next(new ErrorHandler(`Bạn chỉ tạo được tối đa ${PLAYLIST_LIMITS.perUser} danh sách`, 400));
    const item = req.body.movie ? itemFrom(req.body.movie) : null;
    const playlist = await playlistModel.create({
      owner: req.user?._id,
      name,
      description: str(req.body.description, PLAYLIST_LIMITS.description),
      visibility: visibilityOf(req.body.visibility),
      items: item ? [item] : [],
    });
    res.status(201).json(await full(playlist.toObject(), uid(req)));
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// GET /playlists/:id — the owner always; anyone else only when shared by link.
export const getPlaylist = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isId(req.params.id)) return next(new ErrorHandler("Không tìm thấy danh sách", 404));
    const playlist = await playlistModel.findById(req.params.id).lean();
    // Private lists answer like missing ones, so their existence isn't revealed.
    if (!playlist || (playlist.visibility !== "link" && String(playlist.owner) !== uid(req))) {
      return next(new ErrorHandler("Không tìm thấy danh sách", 404));
    }
    res.json(await full(playlist, uid(req)));
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// PUT /playlists/:id { name?, description?, visibility?, order?: slug[] }
export const updatePlaylist = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const playlist = await ownPlaylist(req, next);
    if (!playlist) return;
    if (req.body.name !== undefined) {
      const name = str(req.body.name, PLAYLIST_LIMITS.name);
      if (!name) return next(new ErrorHandler("Tên danh sách không được để trống", 400));
      playlist.name = name;
    }
    if (req.body.description !== undefined) playlist.description = str(req.body.description, PLAYLIST_LIMITS.description);
    if (req.body.visibility !== undefined) playlist.visibility = visibilityOf(req.body.visibility);
    // New order of the items; slugs not given keep their place after the given ones.
    if (Array.isArray(req.body.order)) {
      const position = new Map<string, number>(req.body.order.filter((s: unknown) => typeof s === "string").map((s: string, i: number) => [s, i]));
      const items = [...playlist.items];
      items.sort((a, b) => (position.get(a.slug) ?? 1e9) - (position.get(b.slug) ?? 1e9));
      playlist.items = items as any;
    }
    await playlist.save();
    res.json(await full(playlist.toObject(), uid(req)));
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// DELETE /playlists/:id
export const deletePlaylist = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const playlist = await ownPlaylist(req, next);
    if (!playlist) return;
    await playlist.deleteOne();
    res.json({ success: true, _id: req.params.id });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// POST /playlists/:id/items { movie } — adds to the top; adding again is a no-op.
export const addPlaylistItem = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = itemFrom(req.body.movie);
    if (!item) return next(new ErrorHandler("Thiếu thông tin phim", 400));
    if (!isId(req.params.id)) return next(new ErrorHandler("Không tìm thấy danh sách", 404));
    // Atomic: only when not already there and below the size limit.
    const updated = await playlistModel.findOneAndUpdate(
      { _id: req.params.id, owner: req.user?._id, "items.slug": { $ne: item.slug }, [`items.${PLAYLIST_LIMITS.items - 1}`]: { $exists: false } },
      { $push: { items: { $each: [item], $position: 0 } } },
      { new: true }
    ).lean();
    if (updated) return res.json(summary(updated, item.slug));
    const existing = await playlistModel.findOne({ _id: req.params.id, owner: req.user?._id }).lean();
    if (!existing) return next(new ErrorHandler("Không tìm thấy danh sách", 404));
    if (existing.items.some((i) => i.slug === item.slug)) return res.json(summary(existing, item.slug));
    next(new ErrorHandler(`Mỗi danh sách chứa tối đa ${PLAYLIST_LIMITS.items} phim`, 400));
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// DELETE /playlists/:id/items/:slug
export const removePlaylistItem = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isId(req.params.id)) return next(new ErrorHandler("Không tìm thấy danh sách", 404));
    const updated = await playlistModel
      .findOneAndUpdate({ _id: req.params.id, owner: req.user?._id }, { $pull: { items: { slug: req.params.slug } } }, { new: true })
      .lean();
    if (!updated) return next(new ErrorHandler("Không tìm thấy danh sách", 404));
    res.json(summary(updated, req.params.slug));
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});
