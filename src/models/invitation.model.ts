import mongoose, { Document, Schema } from "mongoose";

export type InvitationStatus = "pending" | "accepted" | "rejected";

export interface IInvitation extends Document {
  fromUser: mongoose.Types.ObjectId;
  toUser: mongoose.Types.ObjectId;
  status: InvitationStatus;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema: Schema = new Schema(
  {
    fromUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    toUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

InvitationSchema.index(
  { fromUser: 1, toUser: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

export const InvitationModel = mongoose.model<IInvitation>("Invitation", InvitationSchema);
