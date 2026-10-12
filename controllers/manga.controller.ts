import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import { User } from "../models/user.model";

const MAX_MANGA_HISTORY = 100;
const MAX_READ_CHAPTERS = 2000;

// Same response shape as the other user endpoints, so the client can refresh its stored user.
const sendUser = (res: Response, user: User) => {
  const accessToken = jwt.sign({ id: user._id }, process.env.ACCESS_TOKEN_SECRET as string, { expiresIn: "5m" });
  res.status(200).json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      followedMovie: user.followedMovie,
      history: user.history,
      followedManga: user.followedManga,
      mangaHistory: user.mangaHistory,
    },
    accessToken,
  });
};

const text = (value: unknown, max = 500) => (typeof value === "string" ? value.slice(0, max) : "");

export const addFollowedManga = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const mangaId = text(req.body.manga_id, 64);
    if (!user) return next(new ErrorHandler("User not found in request", 400));
    if (!mangaId) return next(new ErrorHandler("Manga id is required", 400));

    if (user.followedManga.some((m) => m.manga_id === mangaId)) {
      return next(new ErrorHandler("Manga already followed", 400));
    }

    user.followedManga = [
      { manga_id: mangaId, title: text(req.body.title), cover: text(req.body.cover), followed_at: new Date() },
      ...user.followedManga,
    ];
    await user.save();
    sendUser(res, user);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const removeFollowedManga = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const mangaId = text(req.body.manga_id, 64);
    if (!user) return next(new ErrorHandler("User not found in request", 400));
    if (!mangaId) return next(new ErrorHandler("Manga id is required", 400));

    user.followedManga = user.followedManga.filter((m) => m.manga_id !== mangaId);
    await user.save();
    sendUser(res, user);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// Records the chapter being read: moves the manga to the top and marks the chapter as read.
export const addToMangaHistory = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const mangaId = text(req.body.manga_id, 64);
    const chapterId = text(req.body.chapter_id, 64);
    if (!user) return next(new ErrorHandler("User not found in request", 400));
    if (!mangaId || !chapterId) return next(new ErrorHandler("Manga id and chapter id are required", 400));

    const existing = user.mangaHistory.find((m) => m.manga_id === mangaId);
    const readChapters = existing?.read_chapters || [];
    const entry = {
      manga_id: mangaId,
      title: text(req.body.title) || existing?.title || "",
      cover: text(req.body.cover) || existing?.cover || "",
      chapter_id: chapterId,
      chapter_label: text(req.body.chapter_label, 200),
      lang: text(req.body.lang, 10),
      read_chapters: (readChapters.includes(chapterId) ? readChapters : [...readChapters, chapterId]).slice(
        -MAX_READ_CHAPTERS
      ),
      updated_at: new Date(),
    };

    user.mangaHistory = [entry, ...user.mangaHistory.filter((m) => m.manga_id !== mangaId)].slice(0, MAX_MANGA_HISTORY);
    await user.save();
    sendUser(res, user);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// Removes one manga from the history, or clears it when no id is given.
export const removeMangaHistory = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const mangaId = text(req.body.manga_id, 64);
    if (!user) return next(new ErrorHandler("User not found in request", 400));

    user.mangaHistory = mangaId ? user.mangaHistory.filter((m) => m.manga_id !== mangaId) : [];
    await user.save();
    sendUser(res, user);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});
