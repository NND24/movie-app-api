"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteReply = exports.deleteComment = exports.addAnswer = exports.addComment = exports.getComment = void 0;
const catchAsyncError_1 = require("../middlewares/catchAsyncError");
const ErrorHandler_1 = __importDefault(require("../utils/ErrorHandler"));
const movie_model_1 = __importDefault(require("../models/movie.model"));
exports.getComment = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { slug } = req.params;
        const movieComment = await movie_model_1.default
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
            return next(new ErrorHandler_1.default("Movie not found", 404));
        }
        res.json(movieComment);
    }
    catch (error) {
        next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.addComment = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { slug, comment } = req.body;
        let movie = await movie_model_1.default.findOne({ slug });
        if (!movie) {
            movie = new movie_model_1.default({ slug, comments: [] });
        }
        const newComment = {
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
    }
    catch (error) {
        next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.addAnswer = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { slug, answer, commentId } = req.body;
        const movie = await movie_model_1.default.findOne({ slug });
        if (!movie) {
            return next(new ErrorHandler_1.default("Movie not found", 404));
        }
        const comment = movie.comments.find((item) => item._id.toString() === commentId);
        if (!comment) {
            return next(new ErrorHandler_1.default("Invalid Comment ID", 400));
        }
        const newAnswer = {
            user: req?.user?._id,
            comment: answer,
        };
        comment.commentReplies.push(newAnswer);
        await movie.save();
        res.status(200).json({
            success: true,
            movie,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.deleteComment = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { slug, commentId } = req.body;
        const movie = await movie_model_1.default.findOne({ slug });
        if (!movie) {
            return next(new ErrorHandler_1.default("Movie not found", 404));
        }
        const commentIndex = movie.comments.findIndex((item) => item._id.equals(commentId));
        if (commentIndex === -1) {
            return next(new ErrorHandler_1.default("Comment not found", 404));
        }
        movie.comments.splice(commentIndex, 1);
        await movie.save();
        res.status(200).json({
            success: true,
            message: "Comment deleted successfully",
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.deleteReply = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { slug, commentId, replyId } = req.body;
        const movie = (await movie_model_1.default.findOne({ slug }));
        if (!movie) {
            return next(new ErrorHandler_1.default("Movie not found", 404));
        }
        const comment = movie.comments.find((item) => item._id.equals(commentId));
        if (!comment) {
            return next(new ErrorHandler_1.default("Comment not found", 404));
        }
        const replyIndex = comment.commentReplies.findIndex((item) => item._id.equals(replyId));
        if (replyIndex === -1) {
            return next(new ErrorHandler_1.default("Reply not found", 404));
        }
        comment.commentReplies.splice(replyIndex, 1);
        await movie.save();
        res.status(200).json({
            success: true,
            message: "Reply deleted successfully",
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
