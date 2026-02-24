import mongoose, { Document, Schema } from "mongoose";

export interface ILike extends Document {
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  status: "pending" | "accepted" | "declined";
  createdAt: Date;
  updatedAt: Date;
}

const LikeSchema: Schema<ILike> = new Schema<ILike>(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

LikeSchema.index({ sender: 1, receiver: 1 }, { unique: true });

export const LikeModel = mongoose.model<ILike>("Like", LikeSchema);
