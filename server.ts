import { app } from "./app";
import connectDB from "./utils/connectDB";
require("dotenv").config();

// Connect to the database
connectDB();

// Start the server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
