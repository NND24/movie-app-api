import express from "express";
import { isAuthenticated } from "../middlewares/auth";
import { addAnswer, addComment, getComment } from "../controllers/movie.controller";
const movieRouter = express.Router();

movieRouter.get("/get-comment/:slug", getComment);
movieRouter.put("/add-comment", isAuthenticated, addComment);
movieRouter.put("/add-answer", isAuthenticated, addAnswer);

export default movieRouter;
