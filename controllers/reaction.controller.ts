import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import movieReactionModel from "../models/movieReaction.model";

const slugOf = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 200) : "");

// Community rating summary for a movie, plus the viewer's own rating/like when logged in.
const getSummary = async (slug: string, userId?: unknown) => {
  const [stats] = await movieReactionModel.aggregate([
    { $match: { slug } },
    {
      $group: {
        _id: null,
        likes: { $sum: { $cond: ["$liked", 1, 0] } },
        count: { $sum: { $cond: [{ $gt: ["$score", 0] }, 1, 0] } },
        total: { $sum: "$score" },
        s1: { $sum: { $cond: [{ $eq: ["$score", 1] }, 1, 0] } },
        s2: { $sum: { $cond: [{ $eq: ["$score", 2] }, 1, 0] } },
        s3: { $sum: { $cond: [{ $eq: ["$score", 3] }, 1, 0] } },
        s4: { $sum: { $cond: [{ $eq: ["$score", 4] }, 1, 0] } },
        s5: { $sum: { $cond: [{ $eq: ["$score", 5] }, 1, 0] } },
      },
    },
  ]);
  const mine = userId ? await movieReactionModel.findOne({ slug, user: userId }).lean() : null;
  return {
    slug,
    average: stats?.count ? Math.round((stats.total / stats.count) * 10) / 10 : 0,
    count: stats?.count || 0,
    // Number of ratings per star, index 0 = 1 star.
    distribution: stats ? [stats.s1, stats.s2, stats.s3, stats.s4, stats.s5] : [0, 0, 0, 0, 0],
    likes: stats?.likes || 0,
    myScore: mine?.score || 0,
    liked: !!mine?.liked,
  };
};

export const getReactions = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = slugOf(req.params.slug);
    if (!slug) return next(new ErrorHandler("Movie slug is required", 400));
    res.json(await getSummary(slug, req.user?._id));
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// Sets the viewer's rating (1–5); 0 removes it.
export const rateMovie = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = slugOf(req.body.slug);
    const score = Number(req.body.score);
    if (!req.user) return next(new ErrorHandler("User not found in request", 400));
    if (!slug) return next(new ErrorHandler("Movie slug is required", 400));
    if (!Number.isInteger(score) || score < 0 || score > 5) {
      return next(new ErrorHandler("Score must be a whole number from 0 to 5", 400));
    }
    const user = new mongoose.Types.ObjectId(String(req.user._id));
    await movieReactionModel.updateOne({ slug, user }, { $set: { score } }, { upsert: true });
    res.json(await getSummary(slug, user));
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

// Sets whether the viewer likes the movie.
export const likeMovie = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = slugOf(req.body.slug);
    if (!req.user) return next(new ErrorHandler("User not found in request", 400));
    if (!slug) return next(new ErrorHandler("Movie slug is required", 400));
    const user = new mongoose.Types.ObjectId(String(req.user._id));
    await movieReactionModel.updateOne({ slug, user }, { $set: { liked: !!req.body.liked } }, { upsert: true });
    res.json(await getSummary(slug, user));
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});
