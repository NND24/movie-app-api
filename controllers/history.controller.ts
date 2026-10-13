import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import { sendUser } from "./manga.controller";

// Removes movies from the watch history: { movie_slugs: string[] }, or everything with { all: true }.
export const removeFromHistory = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return next(new ErrorHandler("User not found in request", 400));

    if (req.body.all === true) {
      user.history = [];
    } else {
      const slugs: string[] = Array.isArray(req.body.movie_slugs)
        ? req.body.movie_slugs.filter((s: unknown) => typeof s === "string").slice(0, 500)
        : [];
      if (slugs.length === 0) return next(new ErrorHandler("movie_slugs is required", 400));
      user.history = user.history.filter((item) => !slugs.includes(item.movie_slug));
    }

    await user.save();
    sendUser(res, user);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});
