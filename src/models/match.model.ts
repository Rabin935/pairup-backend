import mongoose, { Document, Schema } from "mongoose";

export interface IMatch extends Document {
  users: [mongoose.Types.ObjectId, mongoose.Types.ObjectId];
  createdAt: Date;
}

const MatchSchema: Schema<IMatch> = new Schema<IMatch>(
  {
    users: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      ],
      required: true,
      validate: {
        validator: (users: mongoose.Types.ObjectId[]) =>
          users.length === 2 &&
          new Set(users.map((userId) => userId.toString())).size === 2,
        message: "Match must contain exactly 2 distinct users.",
      },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

MatchSchema.pre("validate", function normalizeUsers(this: IMatch) {
  if (this.users && this.users.length === 2) {
    const [a, b] = [this.users[0].toString(), this.users[1].toString()];
    if (a.localeCompare(b) > 0) {
      this.users = [
        new mongoose.Types.ObjectId(b),
        new mongoose.Types.ObjectId(a),
      ];
    }
  }
});

// Supports fast lookup for queries like: { users: { $in: [currentUserId] } }
MatchSchema.index({ users: 1 });
MatchSchema.index({ "users.0": 1, "users.1": 1 }, { unique: true });

export const MatchModel = mongoose.model<IMatch>("Match", MatchSchema);
