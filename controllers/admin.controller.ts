import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import userModel from "../models/user.model";
import movieCommentModel from "../models/movieComment.model";
import movieReactionModel from "../models/movieReaction.model";

// All handlers here run behind isAuthenticated + isAdmin (see routes/admin.route.ts).

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_DAYS = 14;

const isId = (value: unknown): value is string => typeof value === "string" && mongoose.isValidObjectId(value);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pageArgs = (req: Request, maxLimit = 50) => {
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || 20));
  const page = Math.max(1, Number(req.query.page) || 1);
  return { limit, page, skip: (page - 1) * limit };
};

// Per-day counts for the last ACTIVITY_DAYS days (UTC+7 calendar days), oldest first.
const dailyCounts = async (model: mongoose.Model<any>, since: Date) => {
  const rows: { _id: string; count: number }[] = await model.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+07:00" } }, count: { $sum: 1 } } },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r.count]));
  return Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
    const day = new Date(Date.now() + 7 * 3600 * 1000 - (ACTIVITY_DAYS - 1 - i) * DAY_MS).toISOString().slice(0, 10);
    return { day, count: byDay.get(day) || 0 };
  });
};

// GET /admin/stats
export const getAdminStats = CatchAsyncError(async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    const since = new Date(Date.now() - ACTIVITY_DAYS * DAY_MS);
    const [users, newUsers, admins, banned, comments, newComments, reported, hidden, ratings, signups, commentDays, topMovies] =
      await Promise.all([
        userModel.countDocuments(),
        userModel.countDocuments({ createdAt: { $gte: weekAgo } }),
        userModel.countDocuments({ role: "admin" }),
        userModel.countDocuments({ banned: true }),
        movieCommentModel.countDocuments(),
        movieCommentModel.countDocuments({ createdAt: { $gte: weekAgo } }),
        movieCommentModel.countDocuments({ "reports.0": { $exists: true } }),
        movieCommentModel.countDocuments({ hidden: true }),
        movieReactionModel.countDocuments({ score: { $gt: 0 } }),
        dailyCounts(userModel, since),
        dailyCounts(movieCommentModel, since),
        movieCommentModel.aggregate([
          { $group: { _id: "$slug", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ]),
      ]);
    res.json({
      users: { total: users, newThisWeek: newUsers, admins, banned },
      comments: { total: comments, newThisWeek: newComments, reported, hidden },
      ratings,
      activity: signups.map((d, i) => ({ day: d.day, signups: d.count, comments: commentDays[i].count })),
      topMovies: topMovies.map((m: { _id: string; count: number }) => ({ slug: m._id, comments: m.count })),
    });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// GET /admin/users?q=&role=all|admin|user|banned&sort=new|old|name&page=&limit=
export const listUsers = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, page, skip } = pageArgs(req);
    const filter: Record<string, unknown> = {};
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }
    if (req.query.role === "admin") filter.role = "admin";
    else if (req.query.role === "user") filter.role = { $ne: "admin" };
    else if (req.query.role === "banned") filter.banned = true;
    const sort: Record<string, 1 | -1> =
      req.query.sort === "old" ? { createdAt: 1 } : req.query.sort === "name" ? { name: 1 } : { createdAt: -1 };

    const [items, total] = await Promise.all([
      userModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select("name email avatar role banned bannedReason bannedAt createdAt followedMovie history followedManga")
        .lean(),
      userModel.countDocuments(filter),
    ]);
    const commentCounts: { _id: mongoose.Types.ObjectId; count: number }[] = items.length
      ? await movieCommentModel.aggregate([
          { $match: { user: { $in: items.map((u) => u._id) } } },
          { $group: { _id: "$user", count: { $sum: 1 } } },
        ])
      : [];
    const countBy = new Map(commentCounts.map((c) => [String(c._id), c.count]));

    res.json({
      users: items.map((u: any) => ({
        _id: String(u._id),
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        role: u.role || "user",
        banned: !!u.banned,
        bannedReason: u.bannedReason || "",
        bannedAt: u.bannedAt,
        createdAt: u.createdAt,
        followedCount: (u.followedMovie || []).length,
        watchedCount: (u.history || []).length,
        mangaCount: (u.followedManga || []).length,
        commentCount: countBy.get(String(u._id)) || 0,
        isSelf: String(u._id) === String(req.user?._id),
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

const findTarget = async (req: Request, next: NextFunction) => {
  if (!isId(req.params.id)) {
    next(new ErrorHandler("Invalid user id", 400));
    return null;
  }
  if (String(req.params.id) === String(req.user?._id)) {
    next(new ErrorHandler("Bạn không thể thay đổi tài khoản của chính mình tại đây", 400));
    return null;
  }
  const user = await userModel.findById(req.params.id).select("role banned");
  if (!user) next(new ErrorHandler("User not found", 404));
  return user;
};

// PUT /admin/users/:id/role { role: "admin" | "user" }
export const setUserRole = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.body.role === "admin" ? "admin" : req.body.role === "user" ? "user" : null;
    if (!role) return next(new ErrorHandler("Role must be admin or user", 400));
    const user = await findTarget(req, next);
    if (!user) return;
    // updateOne skips the save hooks; only this field changes.
    await userModel.updateOne({ _id: user._id }, { $set: { role } });
    res.json({ _id: String(user._id), role });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// PUT /admin/users/:id/ban { banned, reason? }
export const setUserBanned = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const banned = !!req.body.banned;
    const user = await findTarget(req, next);
    if (!user) return;
    if (banned && user.role === "admin") return next(new ErrorHandler("Hãy gỡ quyền quản trị trước khi khóa tài khoản này", 400));
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 200) : "";
    await userModel.updateOne(
      { _id: user._id },
      // Banning also ends every login session (refresh tokens).
      banned
        ? { $set: { banned: true, bannedReason: reason, bannedAt: new Date(), refreshToken: [] } }
        : { $set: { banned: false, bannedReason: "" }, $unset: { bannedAt: 1 } }
    );
    res.json({ _id: String(user._id), banned, bannedReason: banned ? reason : "" });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// DELETE /admin/users/:id — removes the account with its comments (and their replies) and ratings.
export const deleteUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await findTarget(req, next);
    if (!user) return;
    if (user.role === "admin") return next(new ErrorHandler("Hãy gỡ quyền quản trị trước khi xóa tài khoản này", 400));
    const own = await movieCommentModel.find({ user: user._id, parent: null }).select("_id").lean();
    const [comments] = await Promise.all([
      movieCommentModel.deleteMany({ $or: [{ user: user._id }, { parent: { $in: own.map((c) => c._id) } }] }),
      movieReactionModel.deleteMany({ user: user._id }),
      // Their likes on other comments.
      movieCommentModel.updateMany({ likes: user._id }, { $pull: { likes: user._id }, $inc: { likeCount: -1 } }),
      userModel.deleteOne({ _id: user._id }),
    ]);
    res.json({ success: true, _id: String(user._id), deletedComments: comments.deletedCount });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// GET /admin/comments?status=all|reported|hidden&q=&slug=&user=&sort=new|reports&page=&limit=
export const listComments = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, page, skip } = pageArgs(req);
    const filter: Record<string, unknown> = {};
    if (req.query.status === "reported") filter["reports.0"] = { $exists: true };
    else if (req.query.status === "hidden") filter.hidden = true;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q) filter.content = new RegExp(escapeRegex(q), "i");
    if (typeof req.query.slug === "string" && req.query.slug) filter.slug = req.query.slug.slice(0, 200);
    if (isId(req.query.user)) filter.user = new mongoose.Types.ObjectId(req.query.user);

    const pipeline: mongoose.PipelineStage[] = [
      { $match: filter },
      { $addFields: { reportCount: { $size: { $ifNull: ["$reports", []] } } } },
      { $sort: req.query.sort === "reports" ? { reportCount: -1, createdAt: -1 } : { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ];
    const [items, total] = await Promise.all([movieCommentModel.aggregate(pipeline), movieCommentModel.countDocuments(filter)]);

    const userIds = [...new Set(items.flatMap((c: any) => [String(c.user), ...(c.reports || []).map((r: any) => String(r.user))]))];
    const users = await userModel.find({ _id: { $in: userIds } }).select("name email avatar role banned").lean();
    const userBy = new Map(users.map((u: any) => [String(u._id), u]));
    const brief = (id: unknown) => {
      const u: any = userBy.get(String(id));
      return u
        ? { _id: String(u._id), name: u.name, email: u.email, avatar: u.avatar, role: u.role, banned: !!u.banned }
        : { _id: String(id), name: "Người dùng đã xóa", email: "", role: "user", banned: false };
    };

    res.json({
      comments: items.map((c: any) => ({
        _id: String(c._id),
        slug: c.slug,
        episode: c.episode || "",
        parent: c.parent ? String(c.parent) : null,
        content: c.content,
        spoiler: !!c.spoiler,
        hidden: !!c.hidden,
        likeCount: c.likeCount || 0,
        createdAt: c.createdAt,
        user: brief(c.user),
        reports: (c.reports || []).map((r: any) => ({ user: brief(r.user), reason: r.reason, note: r.note || "", createdAt: r.createdAt })),
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// PUT /admin/comments/bulk { ids: string[], action: "restore" | "hide" | "delete" }
// restore = show again and dismiss its reports.
export const bulkModerateComments = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(isId).slice(0, 100);
    const action = req.body.action;
    if (!ids.length) return next(new ErrorHandler("No comments selected", 400));
    const _ids = ids.map((id: string) => new mongoose.Types.ObjectId(id));
    let affected = 0;
    if (action === "delete") {
      const r = await movieCommentModel.deleteMany({ $or: [{ _id: { $in: _ids } }, { parent: { $in: _ids } }] });
      affected = r.deletedCount;
    } else if (action === "hide" || action === "restore") {
      const r = await movieCommentModel.updateMany(
        { _id: { $in: _ids } },
        action === "hide" ? { $set: { hidden: true } } : { $set: { hidden: false, reports: [] } }
      );
      affected = r.modifiedCount;
    } else {
      return next(new ErrorHandler("Action must be restore, hide or delete", 400));
    }
    res.json({ success: true, action, affected });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});
