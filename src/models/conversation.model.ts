import mongoose, { Document, Schema } from "mongoose";

export interface IConversation extends Document {
  members: mongoose.Types.ObjectId[];
  lastMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema: Schema = new Schema(
  {
    members: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      ],
      validate: {
        validator: (value: mongoose.Types.ObjectId[]) =>
          value.length === 2 &&
          new Set(value.map((memberId) => memberId.toString())).size === 2,
        message: "Conversation must have exactly two distinct members",
      },
      index: true,
      required: true,
    },
    lastMessage: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

ConversationSchema.pre("validate", function normalizeMembers(this: IConversation) {
  if (this.members && this.members.length === 2) {
    const [a, b] = [this.members[0].toString(), this.members[1].toString()];
    if (a.localeCompare(b) > 0) {
      this.members = [new mongoose.Types.ObjectId(b), new mongoose.Types.ObjectId(a)];
    }
  }
});

ConversationSchema.index({ members: 1 });
ConversationSchema.index({ "members.0": 1, "members.1": 1 }, { unique: true });

export const ConversationModel = mongoose.model<IConversation>(
  "Conversation",
  ConversationSchema
);
