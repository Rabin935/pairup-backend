import dotenv from 'dotenv';

dotenv.config();

export const PORT: number = 
process.env.PORT ? parseInt(process.env.PORT): 5000;

export const MONGO_URI: string =
process.env.MONGO_URI || 'mongodb+srv://ttrabin935_db_user:DW6AqoVctjtKXeND@cluster0.92eh3by.mongodb.net/test';

export const JWT_SECRET: string =
    process.env.JWT_SECRET || 'defaultsecret';