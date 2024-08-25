"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyJWT = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
require("dotenv").config();
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        return res.sendStatus(401);
    }
    const token = authHeader.split(" ")[1];
    console.log(token);
    jsonwebtoken_1.default.verify(token, accessTokenSecret, (err, decoded) => {
        if (err)
            return res.sendStatus(403);
        req.user = decoded.UserInfo.username;
        next();
    });
};
exports.verifyJWT = verifyJWT;
