import express from "express";
import { isAuthenticated } from "../middlewares/auth";
import { optionalAuth } from "../middlewares/optionalAuth";
import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listMyPlaylists,
  removePlaylistItem,
  updatePlaylist,
} from "../controllers/playlist.controller";

const playlistRouter = express.Router();

playlistRouter.get("/playlists", isAuthenticated, listMyPlaylists);
playlistRouter.post("/playlists", isAuthenticated, createPlaylist);
// Shared lists can be opened without logging in.
playlistRouter.get("/playlists/:id", optionalAuth, getPlaylist);
playlistRouter.put("/playlists/:id", isAuthenticated, updatePlaylist);
playlistRouter.delete("/playlists/:id", isAuthenticated, deletePlaylist);
playlistRouter.post("/playlists/:id/items", isAuthenticated, addPlaylistItem);
playlistRouter.delete("/playlists/:id/items/:slug", isAuthenticated, removePlaylistItem);

export default playlistRouter;
