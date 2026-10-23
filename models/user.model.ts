require("dotenv").config();
import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";

const emailRegexPattern: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface History extends Document {
  movie_slug: string;
  lasted_ep: number | string;
  watched_eps: string[];
}

// Manga come from MangaDex; title and cover are stored so lists render without extra requests.
export interface FollowedManga {
  manga_id: string;
  title: string;
  cover: string;
  followed_at: Date;
}

export interface MangaHistory {
  manga_id: string;
  title: string;
  cover: string;
  chapter_id: string;
  chapter_label: string;
  lang: string;
  read_chapters: string[];
  updated_at: Date;
}

export interface User extends Document {
  _id: string;
  name: string;
  email: string;
  // Empty for accounts created with Google.
  password: string;
  // Google account id ("sub"), set once the user signs in with Google.
  googleId?: string;
  avatar: {
    public_id: string;
    url: string;
  };
  role: string;
  // Locked by an admin: cannot log in or use authenticated endpoints.
  banned: boolean;
  bannedReason: string;
  bannedAt?: Date;
  followedMovie: string[];
  history: History[];
  followedManga: FollowedManga[];
  mangaHistory: MangaHistory[];
  refreshToken: string[];
  comparedPassword: (password: string) => Promise<boolean>;
}

export const historySchema: Schema<History> = new mongoose.Schema({
  movie_slug: {
    type: String,
    required: true,
  },
  lasted_ep: {
    type: Schema.Types.Mixed,
    required: true,
  },
  watched_eps: [
    {
      type: String,
    },
  ],
});

const followedMangaSchema = new mongoose.Schema<FollowedManga>(
  {
    manga_id: { type: String, required: true },
    title: { type: String, default: "" },
    cover: { type: String, default: "" },
    followed_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const mangaHistorySchema = new mongoose.Schema<MangaHistory>(
  {
    manga_id: { type: String, required: true },
    title: { type: String, default: "" },
    cover: { type: String, default: "" },
    chapter_id: { type: String, required: true },
    chapter_label: { type: String, default: "" },
    lang: { type: String, default: "" },
    read_chapters: [{ type: String }],
    updated_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema: Schema<User> = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter your name"],
    },
    email: {
      type: String,
      required: [true, "please enter your email"],
      validate: {
        validator: function (value: string) {
          return emailRegexPattern.test(value);
        },
        message: "Please enter a valid email",
      },
      unique: true,
    },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    googleId: { type: String, index: { unique: true, sparse: true } },
    avatar: {
      public_id: String,
      url: String,
    },
    role: {
      type: String,
      default: "user",
    },
    banned: { type: Boolean, default: false },
    bannedReason: { type: String, default: "" },
    bannedAt: { type: Date },
    followedMovie: [String],
    history: [historySchema],
    followedManga: [followedMangaSchema],
    mangaHistory: [mangaHistorySchema],
    refreshToken: [String],
  },
  { timestamps: true }
);

userSchema.pre<User>("save", async function (next) {
  // Only hash a new password (otherwise every save would hash the stored hash again).
  if (!this.isModified("password") || !this.password) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparedPassword = async function (enteredPassword: string): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

const userModel: Model<User> = mongoose.model("User", userSchema);

export default userModel;
