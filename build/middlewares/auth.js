"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = exports.isAuthenticated = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ErrorHandler_1 = __importDefault(require("../utils/ErrorHandler"));
const catchAsyncError_1 = require("./catchAsyncError");
const user_model_1 = __importDefault(require("../models/user.model"));
exports.isAuthenticated = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return next(new ErrorHandler_1.default("Unauthorized: No token provided", 401));
    }
    const token = authHeader.split(" ")[1];
    if (token) {
        jsonwebtoken_1.default.verify(token, accessTokenSecret, async (err, decoded) => {
            if (err) {
                return next(new ErrorHandler_1.default("Forbidden: Invalid token", 403));
            }
            if (decoded?.id) {
                const user = await user_model_1.default.findById(decoded.id);
                if (user) {
                    req.user = user;
                    next();
                }
                else {
                    return next(new ErrorHandler_1.default("User not found", 404));
                }
            }
            else {
                return next(new ErrorHandler_1.default("Invalid token payload", 403));
            }
        });
    }
    else {
        return next(new ErrorHandler_1.default("Token not provided", 401));
    }
});
exports.isAdmin = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    if (!req.user) {
        return next(new ErrorHandler_1.default("User not authenticated", 401));
    }
    const { email } = req.user;
    if (!email) {
        return next(new ErrorHandler_1.default("User email not found", 401));
    }
    const adminUser = await user_model_1.default.findOne({ email });
    if (!adminUser) {
        return next(new ErrorHandler_1.default("User not found", 404));
    }
    if (adminUser.role !== "admin") {
        return next(new ErrorHandler_1.default("You are not an admin", 403)); // 403 is more appropriate for authorization errors
    }
    next();
});
