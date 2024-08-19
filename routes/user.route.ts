import express from "express";
import {
  addFollowedMovie,
  getUserInfo,
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleRegister,
  removeFollowedMovie,
  socialAuth,
} from "../controllers/user.controller";
import { isAuthenticated } from "../middlewares/auth";
const userRouter = express.Router();

userRouter.post("/register", handleRegister);
userRouter.post("/login", handleLogin);
userRouter.get("/logout", isAuthenticated, handleLogout);
userRouter.get("/refresh", handleRefreshToken);
userRouter.get("/:id", isAuthenticated, getUserInfo);
userRouter.post("/social-auth", socialAuth);
userRouter.put("/addFollowedMovie", isAuthenticated, addFollowedMovie);
userRouter.put("/removeFollowedMovie", isAuthenticated, removeFollowedMovie);

export default userRouter;
