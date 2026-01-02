import mongoose from "mongoose";
import { MONGO_URI } from "../config";

export const connectDB = async () => {
    try{
        await mongoose.connect(MONGO_URI);
        console.log("MongoDB connected! ");
    } catch(error) {
        console.error("Database error: ", error);

        process.exit(1);
    }
}