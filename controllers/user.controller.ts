require("dotenv").config();
import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import userModel from "../models/user.model";
import jwt from "jsonwebtoken";

export const handleRegister = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;

    const isEmailExisted = await userModel.findOne({ email });
    if (isEmailExisted) {
      return next(new ErrorHandler("Email already exist!", 400));
    }

    const user = await userModel.create({
      name,
      email,
      password,
    });

    res.status(201).json({
      success: true,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface LoginRequest {
  email: string;
  password: string;
}

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET || "123456789";
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET || "123456789";

export const handleLogin = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = req.cookies;
    const { email, password } = req.body as LoginRequest;

    if (!email || !password) {
      return next(new ErrorHandler("Please enter your email and password", 400));
    }

    const user = await userModel.findOne({ email }).select("+password");

    if (!user) {
      return next(new ErrorHandler("Invalid email or password", 400));
    }

    const isCorrectPass = await user.comparedPassword(password);

    if (!isCorrectPass) {
      return next(new ErrorHandler("Invalid email or password", 400));
    } else {
      const accessToken = jwt.sign(
        {
          id: user._id,
        },
        accessTokenSecret,
        { expiresIn: "10s" }
      );
      const newRefreshToken = jwt.sign({ id: user._id }, refreshTokenSecret, { expiresIn: "15s" });

      let newRefreshTokenArray = !cookies?.jwt
        ? user.refreshToken
        : user.refreshToken.filter((rt) => rt !== cookies.jwt);

      if (cookies?.jwt) {
        const refreshToken = cookies.jwt;
        const foundToken = await userModel.findOne({ refreshToken }).exec();

        if (!foundToken) {
          newRefreshTokenArray = [];
        }

        res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
      }

      user.refreshToken = [...newRefreshTokenArray, newRefreshToken];
      const result = await user.save();

      res.cookie("jwt", newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        followedMovie: user.followedMovie,
        history: user.history,
        accessToken,
      });
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const handleRefreshToken = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(401);
    const refreshToken = cookies.jwt;
    res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });

    const foundUser = await userModel.findOne({ refreshToken }).exec();

    if (!foundUser) {
      jwt.verify(refreshToken, accessTokenSecret, async (err: any, decoded: any) => {
        if (err) return res.sendStatus(403);

        const hackedUser = await userModel.findOne({ username: decoded.name }).exec();

        if (hackedUser) {
          hackedUser.refreshToken = [];
          const result = await hackedUser.save();
        }

        return res.sendStatus(403);
      });

      return res.sendStatus(403);
    }

    const newRefreshTokenArray = foundUser.refreshToken.filter((rt) => rt !== refreshToken);

    jwt.verify(refreshToken, refreshTokenSecret, async (err: any, decoded: any) => {
      if (err) {
        foundUser.refreshToken = [...newRefreshTokenArray];
        const result = await foundUser.save();
      }
      if (err || foundUser.name !== decoded.username) return res.sendStatus(403);

      const accessToken = jwt.sign(
        {
          id: decoded._id,
        },
        accessTokenSecret,
        { expiresIn: "10s" }
      );

      const newRefreshToken = jwt.sign({ id: foundUser._id }, refreshTokenSecret, {
        expiresIn: "15s",
      });

      foundUser.refreshToken = [...newRefreshTokenArray, newRefreshToken];
      const result = await foundUser.save();

      res.cookie("jwt", newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.json({ accessToken });
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const handleLogout = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(204);
    const refreshToken = cookies.jwt;

    const foundUser = await userModel.findOne({ refreshToken }).exec();
    if (!foundUser) {
      res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
      return res.sendStatus(204);
    }

    foundUser.refreshToken = foundUser.refreshToken.filter((rt) => rt !== refreshToken);
    const result = await foundUser.save();
    console.log(result);

    res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
    res.sendStatus(204);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const getUserInfo = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req?.params?.id) {
      return next(new ErrorHandler(`User ID required`, 400));
    }
    const user = await userModel.findOne({ _id: req.params.id }).select("-password -refreshToken").exec();
    if (!user) {
      return next(new ErrorHandler(`User ID ${req.params.id} not found`, 204));
    }
    res.json(user);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});
