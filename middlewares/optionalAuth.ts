import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import userModel from "../models/user.model";

// Like isAuthenticated, but never rejects: sets req.user when a valid token is sent, so public
// endpoints can add the viewer's own data.
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization || (req.headers.Authorization as string);
  if (!authHeader?.startsWith("Bearer ")) return next();
  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.ACCESS_TOKEN_SECRET as string) as { id?: string };
    if (decoded?.id) {
      const user = await userModel.findById(decoded.id);
      if (user && !user.banned) req.user = user;
    }
  } catch {
    // Invalid or expired token: continue as a guest.
  }
  next();
};
