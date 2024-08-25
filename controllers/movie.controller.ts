import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import movieModel, { CommentReply, Movie } from "../models/movie.model";

export const getComment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;

    const movieComment = await movieModel
      .findOne({ slug })
      .populate({
        path: "comments.user",
        select: "_id name email avatar",
      })
      .populate({
        path: "comments.commentReplies.user",
        select: "_id name email avatar",
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
      user: req?.user?._id,
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

    const comment = movie.comments.find((item) => item._id.toString() === commentId);

    if (!comment) {
      return next(new ErrorHandler("Invalid Comment ID", 400));
    }

    const newAnswer: any = {
      user: req?.user?._id,
      comment: answer,
    };

    comment.commentReplies.push(newAnswer);

    await movie.save();

    res.status(200).json({
      success: true,
      movie,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

interface DeleteCommentData {
  slug: string;
  commentId: string;
}

export const deleteComment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug, commentId } = req.body as DeleteCommentData;

    const movie = await movieModel.findOne({ slug });

    if (!movie) {
      return next(new ErrorHandler("Movie not found", 404));
    }

    const commentIndex = movie.comments.findIndex((item) => item._id.equals(commentId));

    if (commentIndex === -1) {
      return next(new ErrorHandler("Comment not found", 404));
    }

    movie.comments.splice(commentIndex, 1);

    await movie.save();

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

interface DeleteReplyData {
  slug: string;
  commentId: string;
  replyId: string;
}

export const deleteReply = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug, commentId, replyId } = req.body as DeleteReplyData;

    const movie = (await movieModel.findOne({ slug })) as Movie | null;

    if (!movie) {
      return next(new ErrorHandler("Movie not found", 404));
    }

    const comment = movie.comments.find((item) => item._id.equals(commentId));

    if (!comment) {
      return next(new ErrorHandler("Comment not found", 404));
    }

    const replyIndex = comment.commentReplies.findIndex((item) => item._id.equals(replyId));

    if (replyIndex === -1) {
      return next(new ErrorHandler("Reply not found", 404));
    }

    comment.commentReplies.splice(replyIndex, 1);

    await movie.save();

    res.status(200).json({
      success: true,
      message: "Reply deleted successfully",
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
