import { app } from "./app";
import connectDB from "./utils/connectDB";
import { startReleaseChecker } from "./utils/releaseChecker";
import { attachWatchParty } from "./utils/watchParty";
require("dotenv").config();
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_SECRET_KEY,
});

// Connect to the database
connectDB();

// Start the server
const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

// New episodes / chapters of followed titles -> push notifications.
startReleaseChecker();

// "Xem cùng nhau" rooms (socket.io on the same port).
attachWatchParty(server);
