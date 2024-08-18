import express from "express";
import {
  getUserInfo,
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleRegister,
} from "../controllers/user.controller";
const userRouter = express.Router();

userRouter.post("/register", handleRegister);
userRouter.post("/login", handleLogin);
userRouter.get("/logout", handleLogout);
userRouter.get("/refresh", handleRefreshToken);
userRouter.get("/:id", getUserInfo);

export default userRouter;
