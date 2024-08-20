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
  socialAuth,
  updateAvatar,
  updatePassword,
  updateUserInfo,
} from "../controllers/user.controller";
import { isAuthenticated } from "../middlewares/auth";
const userRouter = express.Router();

userRouter.post("/register", handleRegister);
userRouter.post("/login", handleLogin);
userRouter.get("/logout", isAuthenticated, handleLogout);
userRouter.get("/refresh", handleRefreshToken);
userRouter.get("/:id", isAuthenticated, getUserInfo);
userRouter.post("/social-auth", socialAuth);
userRouter.put("/update-user-info", isAuthenticated, updateUserInfo);
userRouter.put("/update-user-password", isAuthenticated, updatePassword);
userRouter.put("/update-user-avatar", isAuthenticated, updateAvatar);
userRouter.put("/addFollowedMovie", isAuthenticated, addFollowedMovie);
userRouter.put("/removeFollowedMovie", isAuthenticated, removeFollowedMovie);
userRouter.put("/addToHistory", isAuthenticated, addToHistory);

export default userRouter;
