import express, { Application, Request, Response } from "express";
import cors from 'cors';
import { connectDB } from "./database/mongodb";
import bodyParser from "body-parser";
import { PORT } from "./config";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.route";
import adminRoutes from "./routes/admin/admin.route";

const app: Application = express();

app.use(cors({
  origin: [
    'http://10.0.2.2:3000',  // Android Emulator
    'http://localhost:3001', 
    'http://localhost:3000',  // Flutter web
    '*'                       // Allow all (dev only)
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", userRoutes);
app.use("/api/admin", adminRoutes);
// Allow admin dashboard to call endpoints without the /api/admin prefix (dev convenience)
app.use("/", adminRoutes);

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();