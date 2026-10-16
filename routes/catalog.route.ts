import express from "express";
import { getArchiveMovie, getArchiveSources, getSubtitle, getTitles, listArchiveMovies, startSync, syncStatus } from "../controllers/catalog.controller";

const catalogRouter = express.Router();

catalogRouter.get("/catalog/archive", listArchiveMovies);
catalogRouter.get("/catalog/archive/:slug", getArchiveMovie);
catalogRouter.get("/catalog/sources/:slug", getArchiveSources);
catalogRouter.get("/catalog/subtitle/:identifier", getSubtitle);
catalogRouter.get("/catalog/titles", getTitles);
catalogRouter.get("/catalog/sync", syncStatus);
catalogRouter.post("/catalog/sync", startSync);

export default catalogRouter;
