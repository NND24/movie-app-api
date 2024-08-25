require("dotenv").config();
import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import userModel, { User } from "../models/user.model";
import jwt from "jsonwebtoken";
import cloudinary from "cloudinary";

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

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET as string;
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET as string;

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
        { expiresIn: "5m" }
      );

      const newRefreshToken = jwt.sign({ id: user._id }, refreshTokenSecret, { expiresIn: "24h" });

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
      await user.save();

      res.cookie("jwt", newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          followedMovie: user.followedMovie,
          history: user.history,
        },
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
    if (!cookies?.jwt) {
      return next(new ErrorHandler("Unauthorized: No refresh token provided", 401));
    }

    const refreshToken = cookies.jwt;
    res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });

    const foundUser = await userModel.findOne({ refreshToken }).exec();

    if (!foundUser) {
      jwt.verify(refreshToken, refreshTokenSecret, async (err: any, decoded: any) => {
        if (err) {
          return next(new ErrorHandler("Forbidden: Invalid or expired refresh token", 403));
        }

        const hackedUser = await userModel.findOne({ name: decoded.name }).exec();
        if (hackedUser) {
          hackedUser.refreshToken = [];
          await hackedUser.save();
        }

        return next(new ErrorHandler("Forbidden: Possible token misuse detected", 403));
      });

      return next(new ErrorHandler("Forbidden: Refresh token not found", 403));
    }

    const newRefreshTokenArray = foundUser.refreshToken.filter((rt) => rt !== refreshToken);

    jwt.verify(refreshToken, refreshTokenSecret, async (err: any, decoded: any) => {
      if (err) {
        foundUser.refreshToken = newRefreshTokenArray;
        await foundUser.save();
        return next(new ErrorHandler("Forbidden: Refresh token verification failed", 403));
      }

      if (foundUser._id.toString() !== decoded.id) {
        return next(new ErrorHandler("Forbidden: User mismatch", 403));
      }

      const accessToken = jwt.sign({ id: decoded.id }, accessTokenSecret, { expiresIn: "5m" });

      const newRefreshToken = jwt.sign({ id: foundUser._id }, refreshTokenSecret, { expiresIn: "24h" });

      foundUser.refreshToken = [...newRefreshTokenArray, newRefreshToken];
      await foundUser.save();

      res.cookie("jwt", newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.json({ accessToken });
    });
  } catch (error: any) {
    return next(new ErrorHandler(`Internal Server Error: ${error.message}`, 500));
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

    res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
    res.sendStatus(204);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface SocialAuthBody {
  email: string;
  name: string;
  avatar: string;
}

export const socialAuth = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = req.cookies;
    const { email, name, avatar } = req.body as SocialAuthBody;
    const user = await userModel.findOne({ email });
    if (!user) {
      const newUser = await userModel.create({ email, name, avatar });
      const accessToken = jwt.sign(
        {
          id: newUser._id,
        },
        accessTokenSecret,
        { expiresIn: "5m" }
      );
      const newRefreshToken = jwt.sign({ id: newUser._id }, refreshTokenSecret, { expiresIn: "24h" });

      let newRefreshTokenArray = !cookies?.jwt
        ? newUser.refreshToken
        : newUser.refreshToken.filter((rt) => rt !== cookies.jwt);

      if (cookies?.jwt) {
        const refreshToken = cookies.jwt;
        const foundToken = await userModel.findOne({ refreshToken }).exec();

        if (!foundToken) {
          newRefreshTokenArray = [];
        }

        res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
      }

      newUser.refreshToken = [...newRefreshTokenArray, newRefreshToken];
      const result = await newUser.save();

      res.cookie("jwt", newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        avatar: newUser.avatar,
        role: newUser.role,
        followedMovie: newUser.followedMovie,
        history: newUser.history,
        accessToken,
      });
    } else {
      const accessToken = jwt.sign(
        {
          id: user._id,
        },
        accessTokenSecret,
        { expiresIn: "5m" }
      );
      const newRefreshToken = jwt.sign({ id: user._id }, refreshTokenSecret, { expiresIn: "24h" });

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

interface UpdateUserInfo {
  email?: string;
  name?: string;
}

export const updateUserInfo = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body as UpdateUserInfo;
    const userId = req.user?._id;
    const user = await userModel.findById(userId);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    if (name) {
      user.name = name;
    }

    await user.save();

    const accessToken = jwt.sign(
      {
        id: user._id,
      },
      accessTokenSecret,
      { expiresIn: "5m" }
    );

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        followedMovie: user.followedMovie,
        history: user.history,
      },
      accessToken,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface UpdatePassword {
  oldPassword: string;
  newPassword: string;
}

export const updatePassword = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = req.body as UpdatePassword;

    if (!oldPassword || !newPassword) {
      return next(new ErrorHandler("Please enter old and new password", 400));
    }

    const user = await userModel.findById(req.user?._id).select("+password");

    if (user?.password === undefined) {
      return next(new ErrorHandler("Invalid user", 400));
    }

    const isCorrectPass = await user.comparedPassword(oldPassword);

    if (!isCorrectPass) {
      return next(new ErrorHandler("Invalid old password", 400));
    }

    user.password = newPassword;

    await user.save();

    const accessToken = jwt.sign(
      {
        id: user._id,
      },
      accessTokenSecret,
      { expiresIn: "5m" }
    );

    res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        followedMovie: user.followedMovie,
        history: user.history,
      },
      accessToken,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface UpdateAvatar {
  avatar: string;
}

export const updateAvatar = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { avatar } = req.body as UpdateAvatar;
    const userId = req.user?._id;
    const user = await userModel.findById(userId);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    if (avatar) {
      if (user.avatar?.public_id) {
        await cloudinary.v2.uploader.destroy(user.avatar.public_id);
      }

      const myCloud = await cloudinary.v2.uploader.upload(avatar, {
        folder: "avatars",
        width: 150,
      });

      user.avatar = {
        public_id: myCloud.public_id,
        url: myCloud.secure_url,
      };
    }

    await user.save();

    const accessToken = jwt.sign(
      {
        id: user._id,
      },
      accessTokenSecret,
      { expiresIn: "5m" }
    );

    res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        followedMovie: user.followedMovie,
        history: user.history,
      },
      accessToken,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const addFollowedMovie = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.body;
    const user = req.user;

    if (!user) {
      return next(new ErrorHandler("User not found in request", 400));
    }

    if (!slug) {
      return next(new ErrorHandler("Movie slug is required", 400));
    }

    if (user.followedMovie.includes(slug)) {
      return next(new ErrorHandler("Movie already followed", 400));
    }

    user.followedMovie = [...user.followedMovie, slug];
    await user.save();

    const accessToken = jwt.sign(
      {
        id: user._id,
      },
      accessTokenSecret,
      { expiresIn: "5m" }
    );

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        followedMovie: user.followedMovie,
        history: user.history,
      },
      accessToken,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const removeFollowedMovie = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.body;
    const user = req.user;

    if (!user) {
      return next(new ErrorHandler("User not found in request", 400));
    }

    if (!slug) {
      return next(new ErrorHandler("Movie slug is required", 400));
    }

    if (!user.followedMovie.includes(slug)) {
      return next(new ErrorHandler("Movie not found in followed list", 404));
    }

    user.followedMovie = user.followedMovie.filter((followedSlug: string) => followedSlug !== slug);
    await user.save();

    const accessToken = jwt.sign(
      {
        id: user._id,
      },
      accessTokenSecret,
      { expiresIn: "5m" }
    );

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        followedMovie: user.followedMovie,
        history: user.history,
      },
      accessToken,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface addToHistoryBody {
  movie_slug: string;
  ep: string;
}

export const addToHistory = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { movie_slug, ep } = req.body as addToHistoryBody;
    const user = req.user;

    if (!user) {
      return next(new ErrorHandler("User not found in request", 400));
    }

    if (!movie_slug || ep === undefined) {
      return next(new ErrorHandler("Movie slug and episode number are required", 400));
    }

    const historyEntry = user.history.find((item) => item.movie_slug === movie_slug);

    if (historyEntry) {
      historyEntry.lasted_ep = Math.max(Number(historyEntry.lasted_ep), Number(ep));

      if (!historyEntry.watched_eps.includes(ep)) {
        historyEntry.watched_eps.push(ep);
      }
    } else {
      user.history.push({
        movie_slug: movie_slug,
        lasted_ep: ep,
        watched_eps: [ep],
      });
    }

    await user.save();

    const accessToken = jwt.sign(
      {
        id: user._id,
      },
      accessTokenSecret,
      { expiresIn: "5m" }
    );

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        followedMovie: user.followedMovie,
        history: user.history,
      },
      accessToken,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});
