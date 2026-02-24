import mongoose, { Document, Schema } from "mongoose";

export interface IConnection extends Document {
  userA: mongoose.Types.ObjectId;
  userB: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt?: Date;
}

const ConnectionSchema: Schema<IConnection> = new Schema<IConnection>(
  {
    userA: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userB: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

ConnectionSchema.pre("validate", function normalizeOrder(this: IConnection) {
  if (this.userA && this.userB) {
    const [a, b] = [this.userA.toString(), this.userB.toString()];
    if (a.localeCompare(b) > 0) {
      this.userA = new mongoose.Types.ObjectId(b);
      this.userB = new mongoose.Types.ObjectId(a);
    }
  }
});

ConnectionSchema.index({ userA: 1, userB: 1 }, { unique: true });

export const ConnectionModel = mongoose.model<IConnection>("Connection", ConnectionSchema);
