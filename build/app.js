"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const error_1 = require("./middlewares/error");
const movie_route_1 = __importDefault(require("./routes/movie.route"));
const user_route_1 = __importDefault(require("./routes/user.route"));
const corsOptions_1 = require("./utils/corsOptions");
const credentials_1 = require("./middlewares/credentials");
require("dotenv").config();
exports.app = (0, express_1.default)();
exports.app.use(credentials_1.credentials);
exports.app.use((0, cors_1.default)(corsOptions_1.corsOptions));
exports.app.use(express_1.default.json({ limit: "50mb" }));
exports.app.use((0, cookie_parser_1.default)());
exports.app.use("/api/v1", movie_route_1.default, user_route_1.default);
exports.app.all("*", (req, res, next) => {
    const err = new Error(`Route ${req.originalUrl} not found`);
    err.statusCode = 404;
    next(err);
});
exports.app.use(error_1.ErrorMiddleware);
