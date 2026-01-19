import express, { Application, Request, Response } from "express";
import cors from 'cors';
import { connectDB } from "./database/mongodb";
import bodyParser from "body-parser";
import { PORT } from "./config";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.route";

const app: Application = express();

app.use(cors({
  origin: [
    'http://10.0.2.2:3000',  // Android Emulator
    'http://localhost:3000',  // Flutter web
    '*'                       // Allow all (dev only)
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (_req: Request, res: Response) => {
  res.send("Hello, World!");
});

// routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", userRoutes); // 👈 IMPORTANT

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
