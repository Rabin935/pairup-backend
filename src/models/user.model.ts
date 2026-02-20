import mongoose, { Document, Schema } from "mongoose";
import { UserType } from "../types/user.type";

type UserImageType = UserType["images"][number];

export interface IUserImage extends UserImageType {
  _id?: mongoose.Types.ObjectId;
}

export interface IUserSwipe {
  user: mongoose.Types.ObjectId;
  action: "like" | "pass";
  createdAt: Date;
}

export interface IUser extends Omit<UserType, "images">, Document {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  images: IUserImage[];
  swipes: IUserSwipe[];
}

const SwipeSchema: Schema<IUserSwipe> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      enum: ["like", "pass"],
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

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

    profileImagePublicId: {
      type: String,
      default: "",
    },

    images: {
      type: [
        {
          url: {
            type: String,
            required: true,
            trim: true,
          },
          public_id: {
            type: String,
            required: true,
            trim: true,
          },
          isThumbnail: {
            type: Boolean,
            default: false,
          },
        },
      ],
      default: [],
    },

    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    swipes: {
      type: [SwipeSchema],
      default: [],
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
