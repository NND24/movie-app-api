import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
require("dotenv").config();

export const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
