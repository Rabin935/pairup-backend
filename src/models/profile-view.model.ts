import mongoose, { Document, Schema } from "mongoose";

export interface IProfileView extends Document {
  viewer: mongoose.Types.ObjectId;
  profileOwner: mongoose.Types.ObjectId;
  viewedAt: Date;
  createdAt: Date;
}

const ProfileViewSchema: Schema<IProfileView> = new Schema<IProfileView>(
  {
    viewer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    profileOwner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

ProfileViewSchema.index({ profileOwner: 1, createdAt: -1 });
ProfileViewSchema.index({ viewer: 1, profileOwner: 1, createdAt: -1 });

export const ProfileViewModel = mongoose.model<IProfileView>("ProfileView", ProfileViewSchema);
