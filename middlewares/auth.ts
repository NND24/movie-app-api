import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import ErrorHandler from "../utils/ErrorHandler";
import { CatchAsyncError } from "./catchAsyncError";
import userModel from "../models/user.model";

export const isAuthenticated = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET as string;
  const authHeader = req.headers.authorization || (req.headers.Authorization as string);

  if (!authHeader?.startsWith("Bearer ")) {
    return next(new ErrorHandler("Unauthorized: No token provided", 401));
  }

  const token = authHeader.split(" ")[1];
  if (token) {
    jwt.verify(token, accessTokenSecret, async (err, decoded: any) => {
      if (err) {
        return next(new ErrorHandler("Forbidden: Invalid token", 403));
      }

      if (decoded?.id) {
        const user = await userModel.findById(decoded.id);
        if (user) {
          req.user = user;
          next();
        } else {
          return next(new ErrorHandler("User not found", 404));
        }
      } else {
        return next(new ErrorHandler("Invalid token payload", 403));
      }
    });
  } else {
    return next(new ErrorHandler("Token not provided", 401));
  }
});

export const isAdmin = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new ErrorHandler("User not authenticated", 401));
  }

  const { email } = req.user;

  if (!email) {
    return next(new ErrorHandler("User email not found", 401));
  }

  const adminUser = await userModel.findOne({ email });

  if (!adminUser) {
    return next(new ErrorHandler("User not found", 404));
  }

  if (adminUser.role !== "admin") {
    return next(new ErrorHandler("You are not an admin", 403)); // 403 is more appropriate for authorization errors
  }

  next();
});
