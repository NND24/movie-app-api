import mongoose, { Document, Model, Schema } from "mongoose";

export const REPORT_REASONS = ["spam", "offensive", "harassment", "spoiler", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// Distinct reporters needed before a comment is hidden from everyone but its author and admins.
export const HIDE_AFTER_REPORTS = 3;
// "Spoiler" reports needed before an unmarked comment is blurred as a spoiler.
export const SPOILER_AFTER_REPORTS = 2;

export interface CommentReport {
  user: mongoose.Types.ObjectId;
  reason: ReportReason;
  note: string;
  createdAt: Date;
}

export const COMMENT_KINDS = ["movie", "manga"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

// A comment on a movie or a manga, optionally on one episode (chapter). Replies point to their
// top-level comment via `parent`.
export interface MovieComment extends Document {
  _id: mongoose.Types.ObjectId;
  // Comments from before manga support have no kind: they are movie comments.
  kind: CommentKind;
  // Movie slug, or MangaDex manga id.
  slug: string;
  // Episode name as in the episode list ("1", "Full"...), or MangaDex chapter id; "" = the whole movie/manga.
  episode: string;
  // Chapter name shown for manga comments ("Chương 12"), since a chapter id says nothing; "" for movies.
  episodeLabel: string;
  user: mongoose.Types.ObjectId;
  content: string;
  spoiler: boolean;
  parent: mongoose.Types.ObjectId | null;
  likes: mongoose.Types.ObjectId[];
  likeCount: number;
  reports: CommentReport[];
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<CommentReport>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    note: { type: String, default: "", maxlength: 300 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const movieCommentSchema = new Schema<MovieComment>(
  {
    kind: { type: String, enum: COMMENT_KINDS, default: "movie" },
    slug: { type: String, required: true },
    episode: { type: String, default: "" },
    episodeLabel: { type: String, default: "" },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, maxlength: 1000 },
    spoiler: { type: Boolean, default: false },
    parent: { type: Schema.Types.ObjectId, ref: "MovieComment", default: null },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    likeCount: { type: Number, default: 0 },
    reports: [reportSchema],
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

movieCommentSchema.index({ slug: 1, parent: 1, createdAt: -1 });
movieCommentSchema.index({ slug: 1, parent: 1, likeCount: -1, createdAt: -1 });
movieCommentSchema.index({ parent: 1, createdAt: 1 });

const movieCommentModel: Model<MovieComment> = mongoose.model("MovieComment", movieCommentSchema);

export default movieCommentModel;
