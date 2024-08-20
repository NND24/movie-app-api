import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
require("dotenv").config();

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET as string;

interface CustomRequest extends Request {
  user?: string;
}

export const verifyJWT = (req: CustomRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.sendStatus(401);
  }

  const token = authHeader.split(" ")[1];
  console.log(token);

  jwt.verify(token, accessTokenSecret, (err: any, decoded: any) => {
    if (err) return res.sendStatus(403);
    req.user = decoded.UserInfo.username;
    next();
  });
};
