import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import movieModel, { CommentReply } from "../models/movie.model";

export const getComment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;

    const movieComment = await movieModel
      .findOne({ slug })
      .populate({
        path: "comments.user",
        select: "name email avatar",
      })
      .populate({
        path: "comments.commentReplies.user",
        select: "name email avatar",
      });

    if (!movieComment) {
      return next(new ErrorHandler("Movie not found", 404));
    }

    res.json(movieComment);
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

interface AddCommentData {
  slug: string;
  comment: string;
}

export const addComment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug, comment } = req.body as AddCommentData;

    let movie = await movieModel.findOne({ slug });

    if (!movie) {
      movie = new movieModel({ slug, comments: [] });
    }

    const newComment: any = {
      user: req.user._id,
      comment,
      commentReplies: [],
    };

    movie.comments.push(newComment);

    await movie.save();

    res.status(200).json({
      success: true,
      movie,
    });
  } catch (error: any) {
    next(new ErrorHandler(error.message, 500));
  }
});

interface AddAnswerData {
  slug: string;
  answer: string;
  commentId: string;
}

export const addAnswer = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug, answer, commentId } = req.body as AddAnswerData;
    const movie = await movieModel.findOne({ slug });

    if (!movie) {
      return next(new ErrorHandler("Movie not found", 404));
    }

    const comment = movie.comments.find((item) => item._id.equals(commentId));

    if (!comment) {
      return next(new ErrorHandler("Invalid Comment ID", 400));
    }

    const newAnswer: Partial<CommentReply> = {
      user: req.user._id,
      comment: answer,
    };

    comment.commentReplies.push(newAnswer as CommentReply);

    await movie.save();

    res.status(200).json({
      success: true,
      movie,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
