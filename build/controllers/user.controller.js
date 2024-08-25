"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToHistory = exports.removeFollowedMovie = exports.addFollowedMovie = exports.updateAvatar = exports.updatePassword = exports.updateUserInfo = exports.getUserInfo = exports.socialAuth = exports.handleLogout = exports.handleRefreshToken = exports.handleLogin = exports.handleRegister = void 0;
require("dotenv").config();
const catchAsyncError_1 = require("../middlewares/catchAsyncError");
const ErrorHandler_1 = __importDefault(require("../utils/ErrorHandler"));
const user_model_1 = __importDefault(require("../models/user.model"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cloudinary_1 = __importDefault(require("cloudinary"));
exports.handleRegister = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { name, email, password } = req.body;
        const isEmailExisted = await user_model_1.default.findOne({ email });
        if (isEmailExisted) {
            return next(new ErrorHandler_1.default("Email already exist!", 400));
        }
        const user = await user_model_1.default.create({
            name,
            email,
            password,
        });
        res.status(201).json({
            success: true,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;
exports.handleLogin = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const cookies = req.cookies;
        const { email, password } = req.body;
        if (!email || !password) {
            return next(new ErrorHandler_1.default("Please enter your email and password", 400));
        }
        const user = await user_model_1.default.findOne({ email }).select("+password");
        if (!user) {
            return next(new ErrorHandler_1.default("Invalid email or password", 400));
        }
        const isCorrectPass = await user.comparedPassword(password);
        if (!isCorrectPass) {
            return next(new ErrorHandler_1.default("Invalid email or password", 400));
        }
        else {
            const accessToken = jsonwebtoken_1.default.sign({
                id: user._id,
            }, accessTokenSecret, { expiresIn: "5m" });
            const newRefreshToken = jsonwebtoken_1.default.sign({ id: user._id }, refreshTokenSecret, { expiresIn: "24h" });
            let newRefreshTokenArray = !cookies?.jwt
                ? user.refreshToken
                : user.refreshToken.filter((rt) => rt !== cookies.jwt);
            if (cookies?.jwt) {
                const refreshToken = cookies.jwt;
                const foundToken = await user_model_1.default.findOne({ refreshToken }).exec();
                if (!foundToken) {
                    newRefreshTokenArray = [];
                }
                res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
            }
            user.refreshToken = [...newRefreshTokenArray, newRefreshToken];
            await user.save();
            res.cookie("jwt", newRefreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                maxAge: 24 * 60 * 60 * 1000,
            });
            res.status(200).json({
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    avatar: user.avatar,
                    role: user.role,
                    followedMovie: user.followedMovie,
                    history: user.history,
                },
                accessToken,
            });
        }
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.handleRefreshToken = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const cookies = req.cookies;
        if (!cookies?.jwt) {
            return next(new ErrorHandler_1.default("Unauthorized: No refresh token provided", 401));
        }
        const refreshToken = cookies.jwt;
        res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
        const foundUser = await user_model_1.default.findOne({ refreshToken }).exec();
        if (!foundUser) {
            jsonwebtoken_1.default.verify(refreshToken, refreshTokenSecret, async (err, decoded) => {
                if (err) {
                    return next(new ErrorHandler_1.default("Forbidden: Invalid or expired refresh token", 403));
                }
                const hackedUser = await user_model_1.default.findOne({ name: decoded.name }).exec();
                if (hackedUser) {
                    hackedUser.refreshToken = [];
                    await hackedUser.save();
                }
                return next(new ErrorHandler_1.default("Forbidden: Possible token misuse detected", 403));
            });
            return next(new ErrorHandler_1.default("Forbidden: Refresh token not found", 403));
        }
        const newRefreshTokenArray = foundUser.refreshToken.filter((rt) => rt !== refreshToken);
        jsonwebtoken_1.default.verify(refreshToken, refreshTokenSecret, async (err, decoded) => {
            if (err) {
                foundUser.refreshToken = newRefreshTokenArray;
                await foundUser.save();
                return next(new ErrorHandler_1.default("Forbidden: Refresh token verification failed", 403));
            }
            if (foundUser._id.toString() !== decoded.id) {
                return next(new ErrorHandler_1.default("Forbidden: User mismatch", 403));
            }
            const accessToken = jsonwebtoken_1.default.sign({ id: decoded.id }, accessTokenSecret, { expiresIn: "5m" });
            const newRefreshToken = jsonwebtoken_1.default.sign({ id: foundUser._id }, refreshTokenSecret, { expiresIn: "24h" });
            foundUser.refreshToken = [...newRefreshTokenArray, newRefreshToken];
            await foundUser.save();
            res.cookie("jwt", newRefreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                maxAge: 24 * 60 * 60 * 1000,
            });
            return res.json({ accessToken });
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(`Internal Server Error: ${error.message}`, 500));
    }
});
exports.handleLogout = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const cookies = req.cookies;
        if (!cookies?.jwt)
            return res.sendStatus(204);
        const refreshToken = cookies.jwt;
        const foundUser = await user_model_1.default.findOne({ refreshToken }).exec();
        if (!foundUser) {
            res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
            return res.sendStatus(204);
        }
        foundUser.refreshToken = foundUser.refreshToken.filter((rt) => rt !== refreshToken);
        const result = await foundUser.save();
        res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
        res.sendStatus(204);
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.socialAuth = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const cookies = req.cookies;
        const { email, name, avatar } = req.body;
        const user = await user_model_1.default.findOne({ email });
        if (!user) {
            const newUser = await user_model_1.default.create({ email, name, avatar });
            const accessToken = jsonwebtoken_1.default.sign({
                id: newUser._id,
            }, accessTokenSecret, { expiresIn: "5m" });
            const newRefreshToken = jsonwebtoken_1.default.sign({ id: newUser._id }, refreshTokenSecret, { expiresIn: "24h" });
            let newRefreshTokenArray = !cookies?.jwt
                ? newUser.refreshToken
                : newUser.refreshToken.filter((rt) => rt !== cookies.jwt);
            if (cookies?.jwt) {
                const refreshToken = cookies.jwt;
                const foundToken = await user_model_1.default.findOne({ refreshToken }).exec();
                if (!foundToken) {
                    newRefreshTokenArray = [];
                }
                res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
            }
            newUser.refreshToken = [...newRefreshTokenArray, newRefreshToken];
            const result = await newUser.save();
            res.cookie("jwt", newRefreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                maxAge: 24 * 60 * 60 * 1000,
            });
            res.status(200).json({
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                avatar: newUser.avatar,
                role: newUser.role,
                followedMovie: newUser.followedMovie,
                history: newUser.history,
                accessToken,
            });
        }
        else {
            const accessToken = jsonwebtoken_1.default.sign({
                id: user._id,
            }, accessTokenSecret, { expiresIn: "5m" });
            const newRefreshToken = jsonwebtoken_1.default.sign({ id: user._id }, refreshTokenSecret, { expiresIn: "24h" });
            let newRefreshTokenArray = !cookies?.jwt
                ? user.refreshToken
                : user.refreshToken.filter((rt) => rt !== cookies.jwt);
            if (cookies?.jwt) {
                const refreshToken = cookies.jwt;
                const foundToken = await user_model_1.default.findOne({ refreshToken }).exec();
                if (!foundToken) {
                    newRefreshTokenArray = [];
                }
                res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
            }
            user.refreshToken = [...newRefreshTokenArray, newRefreshToken];
            const result = await user.save();
            res.cookie("jwt", newRefreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                maxAge: 24 * 60 * 60 * 1000,
            });
            res.status(200).json({
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                followedMovie: user.followedMovie,
                history: user.history,
                accessToken,
            });
        }
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.getUserInfo = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        if (!req?.params?.id) {
            return next(new ErrorHandler_1.default(`User ID required`, 400));
        }
        const user = await user_model_1.default.findOne({ _id: req.params.id }).select("-password -refreshToken").exec();
        if (!user) {
            return next(new ErrorHandler_1.default(`User ID ${req.params.id} not found`, 204));
        }
        res.json(user);
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.updateUserInfo = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { name } = req.body;
        const userId = req.user?._id;
        const user = await user_model_1.default.findById(userId);
        if (!user) {
            return next(new ErrorHandler_1.default("User not found", 404));
        }
        if (name) {
            user.name = name;
        }
        await user.save();
        const accessToken = jsonwebtoken_1.default.sign({
            id: user._id,
        }, accessTokenSecret, { expiresIn: "5m" });
        res.status(200).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                followedMovie: user.followedMovie,
                history: user.history,
            },
            accessToken,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.updatePassword = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return next(new ErrorHandler_1.default("Please enter old and new password", 400));
        }
        const user = await user_model_1.default.findById(req.user?._id).select("+password");
        if (user?.password === undefined) {
            return next(new ErrorHandler_1.default("Invalid user", 400));
        }
        const isCorrectPass = await user.comparedPassword(oldPassword);
        if (!isCorrectPass) {
            return next(new ErrorHandler_1.default("Invalid old password", 400));
        }
        user.password = newPassword;
        await user.save();
        const accessToken = jsonwebtoken_1.default.sign({
            id: user._id,
        }, accessTokenSecret, { expiresIn: "5m" });
        res.status(201).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                followedMovie: user.followedMovie,
                history: user.history,
            },
            accessToken,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.updateAvatar = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { avatar } = req.body;
        const userId = req.user?._id;
        const user = await user_model_1.default.findById(userId);
        if (!user) {
            return next(new ErrorHandler_1.default("User not found", 404));
        }
        if (avatar) {
            if (user.avatar?.public_id) {
                await cloudinary_1.default.v2.uploader.destroy(user.avatar.public_id);
            }
            const myCloud = await cloudinary_1.default.v2.uploader.upload(avatar, {
                folder: "avatars",
                width: 150,
            });
            user.avatar = {
                public_id: myCloud.public_id,
                url: myCloud.secure_url,
            };
        }
        await user.save();
        const accessToken = jsonwebtoken_1.default.sign({
            id: user._id,
        }, accessTokenSecret, { expiresIn: "5m" });
        res.status(201).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                followedMovie: user.followedMovie,
                history: user.history,
            },
            accessToken,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.addFollowedMovie = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { slug } = req.body;
        const user = req.user;
        if (!user) {
            return next(new ErrorHandler_1.default("User not found in request", 400));
        }
        if (!slug) {
            return next(new ErrorHandler_1.default("Movie slug is required", 400));
        }
        if (user.followedMovie.includes(slug)) {
            return next(new ErrorHandler_1.default("Movie already followed", 400));
        }
        user.followedMovie = [...user.followedMovie, slug];
        await user.save();
        const accessToken = jsonwebtoken_1.default.sign({
            id: user._id,
        }, accessTokenSecret, { expiresIn: "5m" });
        res.status(200).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                followedMovie: user.followedMovie,
                history: user.history,
            },
            accessToken,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.removeFollowedMovie = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { slug } = req.body;
        const user = req.user;
        if (!user) {
            return next(new ErrorHandler_1.default("User not found in request", 400));
        }
        if (!slug) {
            return next(new ErrorHandler_1.default("Movie slug is required", 400));
        }
        if (!user.followedMovie.includes(slug)) {
            return next(new ErrorHandler_1.default("Movie not found in followed list", 404));
        }
        user.followedMovie = user.followedMovie.filter((followedSlug) => followedSlug !== slug);
        await user.save();
        const accessToken = jsonwebtoken_1.default.sign({
            id: user._id,
        }, accessTokenSecret, { expiresIn: "5m" });
        res.status(200).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                followedMovie: user.followedMovie,
                history: user.history,
            },
            accessToken,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.addToHistory = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { movie_slug, ep } = req.body;
        const user = req.user;
        if (!user) {
            return next(new ErrorHandler_1.default("User not found in request", 400));
        }
        if (!movie_slug || ep === undefined) {
            return next(new ErrorHandler_1.default("Movie slug and episode number are required", 400));
        }
        const historyEntry = user.history.find((item) => item.movie_slug === movie_slug);
        if (historyEntry) {
            historyEntry.lasted_ep = Math.max(Number(historyEntry.lasted_ep), Number(ep));
            if (!historyEntry.watched_eps.includes(ep)) {
                historyEntry.watched_eps.push(ep);
            }
        }
        else {
            user.history.push({
                movie_slug: movie_slug,
                lasted_ep: ep,
                watched_eps: [ep],
            });
        }
        await user.save();
        const accessToken = jsonwebtoken_1.default.sign({
            id: user._id,
        }, accessTokenSecret, { expiresIn: "5m" });
        res.status(200).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                followedMovie: user.followedMovie,
                history: user.history,
            },
            accessToken,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
