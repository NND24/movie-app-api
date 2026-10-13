import mongoose, { Document, Model, Schema } from "mongoose";

// One user's rating (1–5 stars, 0 = not rated) and like for one movie.
export interface MovieReaction extends Document {
  slug: string;
  user: mongoose.Types.ObjectId;
  score: number;
  liked: boolean;
}

const movieReactionSchema = new Schema<MovieReaction>(
  {
    slug: { type: String, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    score: { type: Number, min: 0, max: 5, default: 0 },
    liked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

movieReactionSchema.index({ slug: 1, user: 1 }, { unique: true });

const movieReactionModel: Model<MovieReaction> = mongoose.model("MovieReaction", movieReactionSchema);

export default movieReactionModel;
