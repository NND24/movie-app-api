import express from "express";
import { isAuthenticated } from "../middlewares/auth";
import { addAnswer, addComment, getComment } from "../controllers/movie.controller";
import { getReactions, likeMovie, rateMovie } from "../controllers/reaction.controller";
import { optionalAuth } from "../middlewares/optionalAuth";
import { getPersonMovies } from "../controllers/person.controller";
import {
  createComment,
  likeComment,
  listComments,
  moderateComment,
  removeComment,
  reportComment,
} from "../controllers/comment.controller";
const movieRouter = express.Router();

movieRouter.get("/get-comment/:slug", getComment);
movieRouter.put("/add-comment", isAuthenticated, addComment);
movieRouter.put("/add-answer", isAuthenticated, addAnswer);
movieRouter.get("/reactions/:slug", optionalAuth, getReactions);
movieRouter.put("/rate-movie", isAuthenticated, rateMovie);
movieRouter.put("/like-movie", isAuthenticated, likeMovie);
movieRouter.get("/comments/:slug", optionalAuth, listComments);
movieRouter.get("/people/:role/:slug", getPersonMovies);
movieRouter.post("/comments", isAuthenticated, createComment);
movieRouter.put("/comments/:id/like", isAuthenticated, likeComment);
movieRouter.post("/comments/:id/report", isAuthenticated, reportComment);
movieRouter.put("/comments/:id/moderate", isAuthenticated, moderateComment);
movieRouter.delete("/comments/:id", isAuthenticated, removeComment);

export default movieRouter;
