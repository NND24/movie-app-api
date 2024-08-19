import express from "express";
import {
  getUserInfo,
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleRegister,
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

export default userRouter;
