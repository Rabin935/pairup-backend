import mongoose, { Document, Schema } from "mongoose";

export interface IPostLike extends Document {
  owner: mongoose.Types.ObjectId;
  likedBy: mongoose.Types.ObjectId;
  imageId: string;
  seenAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PostLikeSchema = new Schema<IPostLike>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    likedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    imageId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    seenAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

PostLikeSchema.index({ owner: 1, likedBy: 1, imageId: 1 }, { unique: true });

export const PostLikeModel = mongoose.model<IPostLike>("PostLike", PostLikeSchema);
