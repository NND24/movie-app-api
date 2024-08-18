import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ErrorMiddleware } from "./middlewares/error";
import movieRouter from "./routes/movie.route";
import userRouter from "./routes/user.route";
import { corsOptions } from "./utils/corsOptions";
import { credentials } from "./middlewares/credentials";
require("dotenv").config();

export const app = express();

app.use(credentials);
app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use("/api/v1", movieRouter, userRouter);

app.all("*", (req: Request, res: Response, next: NextFunction) => {
  const err = new Error(`Route ${req.originalUrl} not found`) as any;
  err.statusCode = 404;
  next(err);
});

app.use(ErrorMiddleware);
