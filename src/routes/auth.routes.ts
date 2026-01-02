import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectToDb } from "./database/connect-db";
import userRoutes from "./routes/user.route";
import authRoutes from "./routes/auth.route";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get("/", (_req, res) => {
  res.send("Yumm API");
});

app.use("/api", userRoutes);
app.use("/api", authRoutes);

// MongoDB connection
connectToDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error("Failed to start server", err);
});
