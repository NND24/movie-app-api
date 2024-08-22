import mongoose, { Document, Model, Schema } from "mongoose";
import { User } from "./user.model";

export interface CommentReply extends Document {
  user: User;
  comment: string;
}

export interface Comment extends Document {
  user: User;
  comment: string;
  commentReplies: CommentReply[];
}

export interface Movie extends Document {
  slug: string;
  comments: Comment[];
}

const commentReplySchema = new Schema<CommentReply>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    comment: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const commentSchema = new Schema<Comment>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    comment: {
      type: String,
      required: true,
    },
    commentReplies: [commentReplySchema],
  },
  { timestamps: true }
);

const movieSchema = new Schema<Movie>({
  slug: {
    type: String,
    required: true,
  },
  comments: [commentSchema],
});

const movieModel: Model<Movie> = mongoose.model("Movie", movieSchema);

export default movieModel;
