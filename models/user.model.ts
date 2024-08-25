require("dotenv").config();
import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";

const emailRegexPattern: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface History extends Document {
  movie_slug: string;
  lasted_ep: number | string;
  watched_eps: string[];
}

export interface User extends Document {
  _id: string;
  name: string;
  email: string;
  password: string;
  avatar: {
    public_id: string;
    url: string;
  };
  role: string;
  followedMovie: string[];
  history: History[];
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
    avatar: {
      public_id: String,
      url: String,
    },
    role: {
      type: String,
      default: "user",
    },
    followedMovie: [String],
    history: [historySchema],
    refreshToken: [String],
  },
  { timestamps: true }
);

userSchema.pre<User>("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparedPassword = async function (enteredPassword: string): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

const userModel: Model<User> = mongoose.model("User", userSchema);

export default userModel;
