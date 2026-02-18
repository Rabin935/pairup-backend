import mongoose, { Document, Schema } from "mongoose";
import { UserType } from "../types/user.type";

export interface IUser extends UserType, Document {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
}

const UserSchema: Schema = new Schema(
  {
    uid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    firstname: {
      type: String,
      required: true,
      trim: true,
    },

    lastname: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },

    number: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: true,
    },

    authProvider: {
      type: String,
      default: "local",
    },

    // 🔐 Role for admin access
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // 🖼️ Profile image path (Multer)
    image: {
      type: String,
      default: "",
    },

    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },

    age: {
      type: Number,
    },

    location: {
      type: String,
      trim: true,
    },

    interests: {
      type: [String],
      default: [],
    },

    bio: {
      type: String,
      trim: true,
      default: "",
    },

    profileImage: {
      type: String,
      default: "",
    },

    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpire: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
  

);

export const UserModel = mongoose.model<IUser>("User", UserSchema);
