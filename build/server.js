"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const connectDB_1 = __importDefault(require("./utils/connectDB"));
require("dotenv").config();
const cloudinary_1 = require("cloudinary");
// Configure Cloudinary
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_SECRET_KEY,
});
// Connect to the database
(0, connectDB_1.default)();
// Start the server
const PORT = process.env.PORT || 8000;
app_1.app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
