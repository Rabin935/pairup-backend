import mongoose, { Document, Schema } from "mongoose";
import { UserType } from "../types/user.type";

type UserImageType = UserType["images"][number];

export interface IUserImage extends Omit<UserImageType, "likes"> {
  _id?: mongoose.Types.ObjectId;
  likes: mongoose.Types.ObjectId[];
}

export interface IUser extends Omit<UserType, "images" | "blockedUsers">, Document {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  images: IUserImage[];
  blockedUsers: mongoose.Types.ObjectId[];
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

    isBanned: {
      type: Boolean,
      default: false,
      index: true,
    },

    banReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 300,
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

    interestedIn: {
      type: String,
      enum: ["male", "female"],
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
          likes: {
            type: [
              {
                type: Schema.Types.ObjectId,
                ref: "User",
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },

    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    onlineVisibility: {
      type: Boolean,
      default: true,
    },
    notificationPreferences: {
      likes: { type: Boolean, default: true },
      postLikes: { type: Boolean, default: true },
      matches: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
    },
    privacy: {
      showAge: { type: Boolean, default: true },
      showLocation: { type: Boolean, default: true },
      showOnlineStatus: { type: Boolean, default: true },
    },
    blockedUsers: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
      index: true,
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
