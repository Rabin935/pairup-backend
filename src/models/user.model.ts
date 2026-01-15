import mongoose, { Document, Schema } from "mongoose";
import { UserType } from "../types/user.type";
import { required } from "zod/v4/core/util.cjs";


    const UserScheme: Schema = new Schema(
        {
            uid: { type: String, required: false, unique: true, index: true },
            fullName: { type: String, required: true },
            email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
            password: { type: String, required: true },
            authProvider: { type: String, required: true },
            
        },
        {
            timestamps: true,
        }
    );
    export interface IUser extends UserType, Document {
        getUser(uid: any): unknown;
        createUser(userToCreate: any): unknown;
        getUserByEmail(normalizedEmail: string): unknown;
        _id: mongoose.Types.ObjectId;
        createdAt: Date;
        updatedAt: Date;
    }
    export const UserModel = mongoose.model<IUser>("User", UserScheme);

//     uid: true,
//   fullName: true,
//   email: true,
//   authProvider: true,
//   password: true,