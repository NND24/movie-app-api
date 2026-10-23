import express from "express";
import {
  addFollowedMovie,
  addToHistory,
  getUserInfo,
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleRegister,
  removeFollowedMovie,
  googleAuth,
  updateAvatar,
  updatePassword,
  updateUserInfo,
} from "../controllers/user.controller";
import { isAuthenticated } from "../middlewares/auth";
import { deleteComment, deleteReply } from "../controllers/movie.controller";
import {
  addFollowedManga,
  addToMangaHistory,
  removeFollowedManga,
  removeMangaHistory,
} from "../controllers/manga.controller";
import { removeFromHistory } from "../controllers/history.controller";
const userRouter = express.Router();

userRouter.post("/register", handleRegister);
userRouter.post("/login", handleLogin);
userRouter.get("/logout", isAuthenticated, handleLogout);
userRouter.get("/refresh", handleRefreshToken);
userRouter.get("/:id", isAuthenticated, getUserInfo);
userRouter.post("/google-auth", googleAuth);
userRouter.put("/update-user-info", isAuthenticated, updateUserInfo);
userRouter.put("/update-user-password", isAuthenticated, updatePassword);
userRouter.put("/update-user-avatar", isAuthenticated, updateAvatar);
userRouter.put("/addFollowedMovie", isAuthenticated, addFollowedMovie);
userRouter.put("/removeFollowedMovie", isAuthenticated, removeFollowedMovie);
userRouter.put("/addToHistory", isAuthenticated, addToHistory);
userRouter.put("/removeFromHistory", isAuthenticated, removeFromHistory);
userRouter.put("/addFollowedManga", isAuthenticated, addFollowedManga);
userRouter.put("/removeFollowedManga", isAuthenticated, removeFollowedManga);
userRouter.put("/addToMangaHistory", isAuthenticated, addToMangaHistory);
userRouter.put("/removeMangaHistory", isAuthenticated, removeMangaHistory);
userRouter.delete("/comment", isAuthenticated, deleteComment);
userRouter.delete("/comment/reply", isAuthenticated, deleteReply);

export default userRouter;
