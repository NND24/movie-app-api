import express from "express";
import { isAuthenticated } from "../middlewares/auth";
import { addAnswer, addComment, getComment } from "../controllers/movie.controller";
import { getReactions, likeMovie, rateMovie } from "../controllers/reaction.controller";
import { optionalAuth } from "../middlewares/optionalAuth";
const movieRouter = express.Router();

movieRouter.get("/get-comment/:slug", getComment);
movieRouter.put("/add-comment", isAuthenticated, addComment);
movieRouter.put("/add-answer", isAuthenticated, addAnswer);
movieRouter.get("/reactions/:slug", optionalAuth, getReactions);
movieRouter.put("/rate-movie", isAuthenticated, rateMovie);
movieRouter.put("/like-movie", isAuthenticated, likeMovie);

export default movieRouter;
