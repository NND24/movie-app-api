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
    jwt.verify(token, accessTokenSecret, async (err, decoded) => {
      if (err) {
        return next(new ErrorHandler("Forbidden: Invalid token", 403));
      }
      const user = await userModel.findById(decoded?.id);
      req.user = user;
      next();
    });
  }
});

export const isAdmin = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.user;
  const adminUser = await userModel.findOne({ email });
  if (adminUser.role !== "admin") {
    return next(new ErrorHandler("You are not an admin", 401));
  } else {
    next();
  }
});
