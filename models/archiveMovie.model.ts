import mongoose, { Document, Model, Schema } from "mongoose";

// A film from the Internet Archive (public domain / openly licensed), described with TMDB data in
// Vietnamese and English. Shown in the app's movie lists next to vsmov's movies: one entry per film
// (tmdbId), and when vsmov has the same film (vsmovSlug), it is offered as an extra source there.
// Items that could not be used are kept with status "skipped", so they aren't fetched again.

export interface Localized {
  vi: string;
  en: string;
}

export interface ArchiveMovie extends Document {
  identifier: string;
  status: "ready" | "skipped";
  skipReason?: string;
  slug?: string;
  tmdbId?: number;
  imdbId?: string;
  title?: Localized;
  originalTitle?: string;
  overview?: Localized;
  poster?: string;
  backdrop?: string;
  year?: number;
  runtime?: number;
  // App genre slugs (vsmov's) and TMDB genre ids.
  genres: string[];
  tmdbGenres: number[];
  // App country slugs (vsmov's) and ISO codes.
  countries: string[];
  countryCodes: string[];
  directors: string[];
  cast: string[];
  voteAverage?: number;
  voteCount?: number;
  downloads: number;
  // Video file in the item (https://archive.org/download/<identifier>/<file>), length in seconds.
  video?: { file: string; length: number; size: number };
  subtitles: { file: string; lang: string; auto: boolean }[];
  // The same film on vsmov, when there is one.
  vsmovSlug?: string;
  // Titles without accents or punctuation, for search.
  searchText?: string;
  syncedAt: Date;
}

const localized = { vi: { type: String, default: "" }, en: { type: String, default: "" } };

const archiveMovieSchema = new Schema<ArchiveMovie>(
  {
    identifier: { type: String, required: true, unique: true },
    status: { type: String, enum: ["ready", "skipped"], required: true },
    skipReason: String,
    slug: { type: String, index: { unique: true, sparse: true } },
    tmdbId: { type: Number, index: true },
    imdbId: String,
    title: localized,
    originalTitle: String,
    overview: localized,
    poster: String,
    backdrop: String,
    year: Number,
    runtime: Number,
    genres: { type: [String], default: [] },
    tmdbGenres: { type: [Number], default: [] },
    countries: { type: [String], default: [] },
    countryCodes: { type: [String], default: [] },
    directors: { type: [String], default: [] },
    cast: { type: [String], default: [] },
    voteAverage: Number,
    voteCount: Number,
    downloads: { type: Number, default: 0 },
    video: { file: String, length: Number, size: Number },
    subtitles: { type: [{ file: String, lang: String, auto: Boolean, _id: false }], default: [] },
    vsmovSlug: { type: String, index: true },
    searchText: String,
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

archiveMovieSchema.index({ status: 1, vsmovSlug: 1, voteCount: -1 });
archiveMovieSchema.index({ genres: 1 });
archiveMovieSchema.index({ countries: 1 });

const archiveMovieModel: Model<ArchiveMovie> = mongoose.model("ArchiveMovie", archiveMovieSchema);

export default archiveMovieModel;
