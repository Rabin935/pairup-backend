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
        validator: (value: mongoose.Types.ObjectId[]) => value.length === 2,
        message: "Conversation must have exactly two members",
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

export const ConversationModel = mongoose.model<IConversation>(
  "Conversation",
  ConversationSchema
);
