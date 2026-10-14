import mongoose, { Document, Model, Schema } from "mongoose";

// Last seen state of a followed movie (episode count) or manga (latest chapter), so the release
// checker can tell when something new came out.
export interface ReleaseSnapshot extends Document {
  kind: "movie" | "manga";
  // Movie slug or MangaDex manga id.
  key: string;
  // Movie: number of episodes. Manga: unused (0).
  count: number;
  // Movie: name of the newest episode. Manga: id of the newest chapter.
  latest: string;
  latestLabel: string;
  checkedAt: Date;
}

const releaseSnapshotSchema = new Schema<ReleaseSnapshot>(
  {
    kind: { type: String, enum: ["movie", "manga"], required: true },
    key: { type: String, required: true },
    count: { type: Number, default: 0 },
    latest: { type: String, default: "" },
    latestLabel: { type: String, default: "" },
    checkedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

releaseSnapshotSchema.index({ kind: 1, key: 1 }, { unique: true });

const releaseSnapshotModel: Model<ReleaseSnapshot> = mongoose.model("ReleaseSnapshot", releaseSnapshotSchema);

export default releaseSnapshotModel;
