import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import movieModel from "../models/movie.model";
import movieCommentModel, {
  CommentKind,
  HIDE_AFTER_REPORTS,
  MovieComment,
  REPORT_REASONS,
  ReportReason,
  SPOILER_AFTER_REPORTS,
} from "../models/movieComment.model";

const MAX_LENGTH = 1000;
const PAGE_LIMIT_MAX = 100;
// Minimum gap between two comments from the same user.
const POST_INTERVAL_MS = 5000;

const USER_FIELDS = "_id name avatar role";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const isId = (value: unknown): value is string => typeof value === "string" && mongoose.isValidObjectId(value);
const kindOf = (value: unknown): CommentKind => (value === "manga" ? "manga" : "movie");
// Movie comments include the older ones saved without a kind.
const kindFilter = (kind: CommentKind) => (kind === "manga" ? "manga" : { $ne: "manga" });

type Viewer = { id: string; admin: boolean } | null;

const viewerOf = (req: Request): Viewer =>
  req.user ? { id: String(req.user._id), admin: req.user.role === "admin" } : null;

// Comments were stored inside the Movie document before; copy them (keeping their ids) the first
// time a movie's comments are read.
const migrateLegacyComments = async (slug: string) => {
  const legacy = await movieModel.findOne({ slug, commentsMigrated: { $ne: true } }).lean();
  if (!legacy) return;
  const docs: Record<string, unknown>[] = [];
  for (const c of (legacy.comments || []) as any[]) {
    if (!c?.user || !c?.comment) continue;
    docs.push({ _id: c._id, slug, episode: "", user: c.user, content: String(c.comment).slice(0, MAX_LENGTH), parent: null, createdAt: c.createdAt, updatedAt: c.updatedAt });
    for (const r of (c.commentReplies || []) as any[]) {
      if (!r?.user || !r?.comment) continue;
      docs.push({ _id: r._id, slug, episode: "", user: r.user, content: String(r.comment).slice(0, MAX_LENGTH), parent: c._id, createdAt: r.createdAt, updatedAt: r.updatedAt });
    }
  }
  if (docs.length) {
    try {
      // timestamps: false keeps the original dates.
      await movieCommentModel.insertMany(docs, { ordered: false, timestamps: false } as any);
    } catch (error: any) {
      // Duplicate ids mean another request already copied them.
      const duplicatesOnly = (error?.writeErrors || []).every((e: any) => (e.code ?? e.err?.code) === 11000);
      if (error?.code !== 11000 && !duplicatesOnly) throw error;
    }
  }
  await movieModel.updateOne({ _id: legacy._id }, { $set: { commentsMigrated: true } });
};

// Shape sent to the client: the viewer's own like/report state, and no content for hidden comments.
const serialize = (c: any, viewer: Viewer) => {
  const userId = c.user?._id ? String(c.user._id) : String(c.user || "");
  const mine = !!viewer && viewer.id === userId;
  const canSeeHidden = mine || !!viewer?.admin;
  const reports: any[] = c.reports || [];
  return {
    _id: String(c._id),
    kind: kindOf(c.kind),
    slug: c.slug,
    episode: c.episode || "",
    episodeLabel: c.episodeLabel || "",
    parent: c.parent ? String(c.parent) : null,
    user: c.user?._id
      ? { _id: userId, name: c.user.name, avatar: c.user.avatar, role: c.user.role }
      : { _id: userId, name: "Người dùng đã xóa", role: "user" },
    content: c.hidden && !canSeeHidden ? "" : c.content,
    spoiler: !!c.spoiler,
    hidden: !!c.hidden,
    likeCount: c.likeCount || 0,
    liked: !!viewer && (c.likes || []).some((id: unknown) => String(id) === viewer.id),
    reported: !!viewer && reports.some((r) => String(r.user) === viewer.id),
    // Admins see how often a comment was reported.
    reportCount: viewer?.admin ? reports.length : undefined,
    mine,
    createdAt: c.createdAt,
  };
};

// GET /comments/:slug?kind=movie|manga&episode=&sort=top|new&limit=
// slug: movie slug or manga id. episode: omitted = all comments, "" (episode=) = whole-movie/manga comments only.
export const listComments = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = text(req.params.slug, 200);
    if (!slug) return next(new ErrorHandler("Movie slug is required", 400));
    const kind = kindOf(req.query.kind);
    if (kind === "movie") await migrateLegacyComments(slug);

    const viewer = viewerOf(req);
    const sort = req.query.sort === "new" ? "new" : "top";
    const limit = Math.min(PAGE_LIMIT_MAX, Math.max(1, Number(req.query.limit) || 10));
    const base = { slug, kind: kindFilter(kind), parent: null };
    const filter: Record<string, unknown> = { ...base };
    if (typeof req.query.episode === "string") filter.episode = text(req.query.episode, 50);

    const [items, total, byEpisode] = await Promise.all([
      movieCommentModel
        .find(filter)
        .sort(sort === "top" ? { likeCount: -1, createdAt: -1 } : { createdAt: -1 })
        .limit(limit)
        .populate("user", USER_FIELDS)
        .lean(),
      movieCommentModel.countDocuments(filter),
      movieCommentModel.aggregate([
        { $match: base },
        { $group: { _id: "$episode", count: { $sum: 1 }, label: { $max: "$episodeLabel" } } },
      ]),
    ]);

    const replies = items.length
      ? await movieCommentModel
          .find({ parent: { $in: items.map((c) => c._id) } })
          .sort({ createdAt: 1 })
          .populate("user", USER_FIELDS)
          .lean()
      : [];
    const repliesByParent = new Map<string, unknown[]>();
    replies.forEach((r) => {
      const key = String(r.parent);
      repliesByParent.set(key, [...(repliesByParent.get(key) || []), serialize(r, viewer)]);
    });

    const episodes: Record<string, number> = {};
    const episodeLabels: Record<string, string> = {};
    byEpisode.forEach((e: { _id: string; count: number; label?: string }) => {
      episodes[e._id || ""] = e.count;
      if (e.label) episodeLabels[e._id || ""] = e.label;
    });

    res.json({
      comments: items.map((c) => ({ ...serialize(c, viewer), replies: repliesByParent.get(String(c._id)) || [] })),
      total,
      hasMore: total > items.length,
      // Top-level comment count per episode ("" = whole movie).
      episodes,
      // Chapter names of manga comments, by chapter id.
      episodeLabels,
      totalAll: Object.values(episodes).reduce((a, b) => a + b, 0),
    });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// POST /comments { kind?, slug, episode?, episodeLabel?, content, spoiler?, parentId? }
export const createComment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return next(new ErrorHandler("User not found in request", 400));
    const kind = kindOf(req.body.kind);
    const slug = text(req.body.slug, 200);
    const content = text(req.body.content, MAX_LENGTH + 1);
    if (!slug) return next(new ErrorHandler("Movie slug is required", 400));
    if (!content) return next(new ErrorHandler("Bình luận không được để trống", 400));
    if (content.length > MAX_LENGTH) return next(new ErrorHandler(`Bình luận tối đa ${MAX_LENGTH} ký tự`, 400));

    const user = new mongoose.Types.ObjectId(String(req.user._id));
    const last = await movieCommentModel.findOne({ user }).sort({ createdAt: -1 }).select("createdAt").lean();
    if (last && Date.now() - new Date(last.createdAt).getTime() < POST_INTERVAL_MS) {
      return next(new ErrorHandler("Bạn bình luận quá nhanh, vui lòng đợi vài giây", 429));
    }

    let parent: MovieComment | null = null;
    if (req.body.parentId) {
      if (!isId(req.body.parentId)) return next(new ErrorHandler("Invalid comment id", 400));
      parent = await movieCommentModel.findOne({ _id: req.body.parentId, slug, kind: kindFilter(kind) });
      if (!parent) return next(new ErrorHandler("Bình luận gốc không còn tồn tại", 404));
      // Replies stay one level deep: answering a reply joins its thread.
      if (parent.parent) parent = await movieCommentModel.findById(parent.parent);
      if (!parent) return next(new ErrorHandler("Bình luận gốc không còn tồn tại", 404));
    }

    const episode = parent ? parent.episode : text(req.body.episode, 50);
    const created = await movieCommentModel.create({
      kind,
      slug,
      episode,
      episodeLabel: kind === "manga" && episode ? (parent ? parent.episodeLabel : text(req.body.episodeLabel, 100)) : "",
      user,
      content,
      spoiler: !!req.body.spoiler,
      parent: parent?._id || null,
    });
    await created.populate("user", USER_FIELDS);
    res.status(201).json({ ...serialize(created.toObject(), viewerOf(req)), replies: [] });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// PUT /comments/:id/like { liked }
export const likeComment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return next(new ErrorHandler("User not found in request", 400));
    if (!isId(req.params.id)) return next(new ErrorHandler("Invalid comment id", 400));
    const user = new mongoose.Types.ObjectId(String(req.user._id));
    const _id = new mongoose.Types.ObjectId(req.params.id);
    // Conditional updates keep likeCount in step with likes when requests race.
    if (req.body.liked) {
      await movieCommentModel.updateOne({ _id, likes: { $ne: user } }, { $push: { likes: user }, $inc: { likeCount: 1 } });
    } else {
      await movieCommentModel.updateOne({ _id, likes: user }, { $pull: { likes: user }, $inc: { likeCount: -1 } });
    }
    const comment = await movieCommentModel.findById(_id).select("likes likeCount").lean();
    if (!comment) return next(new ErrorHandler("Comment not found", 404));
    res.json({ _id: req.params.id, likeCount: comment.likeCount, liked: comment.likes.some((id) => id.equals(user)) });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// POST /comments/:id/report { reason, note? }
export const reportComment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return next(new ErrorHandler("User not found in request", 400));
    if (!isId(req.params.id)) return next(new ErrorHandler("Invalid comment id", 400));
    const reason = req.body.reason as ReportReason;
    if (!REPORT_REASONS.includes(reason)) return next(new ErrorHandler("Lý do báo cáo không hợp lệ", 400));

    const user = new mongoose.Types.ObjectId(String(req.user._id));
    const comment = await movieCommentModel.findById(req.params.id);
    if (!comment) return next(new ErrorHandler("Comment not found", 404));
    if (comment.user.equals(user)) return next(new ErrorHandler("Bạn không thể báo cáo bình luận của mình", 400));

    if (!comment.reports.some((r) => r.user.equals(user))) {
      comment.reports.push({ user, reason, note: text(req.body.note, 300), createdAt: new Date() });
      if (comment.reports.length >= HIDE_AFTER_REPORTS) comment.hidden = true;
      if (comment.reports.filter((r) => r.reason === "spoiler").length >= SPOILER_AFTER_REPORTS) comment.spoiler = true;
      await comment.save();
    }
    res.json({ _id: req.params.id, reported: true, hidden: comment.hidden, spoiler: comment.spoiler });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// PUT /comments/:id/moderate { action: "restore" | "hide" } (admin only)
export const moderateComment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== "admin") return next(new ErrorHandler("Chỉ quản trị viên mới làm được việc này", 400));
    if (!isId(req.params.id)) return next(new ErrorHandler("Invalid comment id", 400));
    const update =
      req.body.action === "hide" ? { $set: { hidden: true } } : { $set: { hidden: false, reports: [] } };
    const comment = await movieCommentModel.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!comment) return next(new ErrorHandler("Comment not found", 404));
    res.json({ _id: req.params.id, hidden: comment.hidden });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// DELETE /comments/:id (author or admin); removes its replies too.
export const removeComment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return next(new ErrorHandler("User not found in request", 400));
    if (!isId(req.params.id)) return next(new ErrorHandler("Invalid comment id", 400));
    const comment = await movieCommentModel.findById(req.params.id).select("user").lean();
    if (!comment) return next(new ErrorHandler("Comment not found", 404));
    if (String(comment.user) !== String(req.user._id) && req.user.role !== "admin") {
      return next(new ErrorHandler("Bạn không thể xóa bình luận của người khác", 400));
    }
    await movieCommentModel.deleteMany({ $or: [{ _id: comment._id }, { parent: comment._id }] });
    res.json({ success: true, _id: req.params.id });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});
