import mongoose, { Document, Model, Schema } from "mongoose";

export const PLAYLIST_LIMITS = { perUser: 50, items: 500, name: 80, description: 300 };

// Movie data copied when added, so lists render without asking the movie source for each one.
export interface PlaylistItem {
  slug: string;
  name: string;
  originName: string;
  poster: string;
  thumb: string;
  year: number;
  episodeCurrent: string;
  type: string;
  addedAt: Date;
}

// A user's own list of movies ("Xem cuối tuần", "Phim Hàn hay"...).
export interface Playlist extends Document {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  name: string;
  description: string;
  // "private": only the owner; "link": anyone with the link can view it.
  visibility: "private" | "link";
  items: PlaylistItem[];
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema<PlaylistItem>(
  {
    slug: { type: String, required: true },
    name: { type: String, default: "" },
    originName: { type: String, default: "" },
    poster: { type: String, default: "" },
    thumb: { type: String, default: "" },
    year: { type: Number, default: 0 },
    episodeCurrent: { type: String, default: "" },
    type: { type: String, default: "" },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const playlistSchema = new Schema<Playlist>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, maxlength: PLAYLIST_LIMITS.name },
    description: { type: String, default: "", maxlength: PLAYLIST_LIMITS.description },
    visibility: { type: String, enum: ["private", "link"], default: "private" },
    items: [itemSchema],
  },
  { timestamps: true }
);

const playlistModel: Model<Playlist> = mongoose.model("Playlist", playlistSchema);

export default playlistModel;
