import dotenv from 'dotenv';

dotenv.config({ quiet: process.env.NODE_ENV === "test" });

export const PORT: number = 
process.env.PORT ? parseInt(process.env.PORT): 3000;

export const HOST: string = process.env.HOST || "0.0.0.0";

export const LAN_IP: string = process.env.LAN_IP || "192.168.18.155";

export const MONGO_URI: string =
process.env.MONGO_URI || 'mongodb+srv://ttrabin935_db_user:DW6AqoVctjtKXeND@cluster0.92eh3by.mongodb.net/test';

export const JWT_SECRET: string =
    process.env.JWT_SECRET || 'defaultsecret';

export const CLIENT_APP_URL: string =
    (process.env.CLIENT_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

export const CLOUDINARY_CLOUD_NAME: string =
    process.env.CLOUDINARY_CLOUD_NAME || '';

export const CLOUDINARY_API_KEY: string =
    process.env.CLOUDINARY_API_KEY || '';

export const CLOUDINARY_API_SECRET: string =
    process.env.CLOUDINARY_API_SECRET || '';

export const CLOUDINARY_FOLDER: string =
    process.env.CLOUDINARY_FOLDER || 'pairup/profiles';
