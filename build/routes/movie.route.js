"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middlewares/auth");
const movie_controller_1 = require("../controllers/movie.controller");
const movieRouter = express_1.default.Router();
movieRouter.get("/get-comment/:slug", movie_controller_1.getComment);
movieRouter.put("/add-comment", auth_1.isAuthenticated, movie_controller_1.addComment);
movieRouter.put("/add-answer", auth_1.isAuthenticated, movie_controller_1.addAnswer);
exports.default = movieRouter;
