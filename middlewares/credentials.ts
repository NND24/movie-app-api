import { NextFunction, Request, Response } from "express";
import { allowedOrigins } from "../utils/allowedOrigins";

export const credentials = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;

  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Credentials", "true");
  }

  next();
};
