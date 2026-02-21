import mongoose, { Document, Schema } from "mongoose";

export interface ISwipe extends Document {
  swiper: mongoose.Types.ObjectId;
  swipedUser: mongoose.Types.ObjectId;
  action: "like" | "dislike";
  createdAt: Date;
  updatedAt: Date;
}

const SwipeSchema: Schema = new Schema(
  {
    swiper: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    swipedUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["like", "dislike"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

SwipeSchema.index({ swiper: 1, swipedUser: 1 }, { unique: true });

export const SwipeModel = mongoose.model<ISwipe>("Swipe", SwipeSchema);
