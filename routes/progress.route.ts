import express from "express";
import { isAuthenticated } from "../middlewares/auth";
import { listProgress, syncProgress } from "../controllers/progress.controller";

const progressRouter = express.Router();

progressRouter.get("/progress", isAuthenticated, listProgress);
progressRouter.put("/progress", isAuthenticated, syncProgress);

export default progressRouter;
