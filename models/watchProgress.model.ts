import mongoose, { Document, Model, Schema } from "mongoose";

// Where a user left off in a movie (its latest episode), synced between their devices.
// Mirrors the client's localStorage entry (movie-app-client/src/utils/watchProgress.ts).
export interface WatchProgress extends Document {
  user: mongoose.Types.ObjectId;
  slug: string;
  episode: string;
  serverName: string;
  server: string;
  title: string;
  originName: string;
  image: string;
  // Seconds; "exact" is false when the position is estimated (embedded player).
  position: number;
  duration: number;
  exact: boolean;
  finished: boolean;
  nextEpisode: string;
  totalEpisodes: number;
  // Random id of the device that saved it (the embedded player only resumes by itself there).
  device: string;
  updatedAt: Date;
}

const watchProgressSchema = new Schema<WatchProgress>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    slug: { type: String, required: true },
    episode: { type: String, required: true },
    serverName: { type: String, default: "" },
    server: { type: String, default: "1" },
    title: { type: String, default: "" },
    originName: { type: String, default: "" },
    image: { type: String, default: "" },
    position: { type: Number, default: 0, min: 0 },
    duration: { type: Number, default: 0, min: 0 },
    exact: { type: Boolean, default: false },
    finished: { type: Boolean, default: false },
    nextEpisode: { type: String, default: "" },
    totalEpisodes: { type: Number, default: 0 },
    device: { type: String, default: "" },
  },
  { timestamps: true }
);

watchProgressSchema.index({ user: 1, slug: 1 }, { unique: true });
watchProgressSchema.index({ user: 1, updatedAt: -1 });

const watchProgressModel: Model<WatchProgress> = mongoose.model("WatchProgress", watchProgressSchema);

export default watchProgressModel;
