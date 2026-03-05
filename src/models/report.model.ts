import mongoose, { Document, Schema } from "mongoose";

export type ReportStatus = "pending" | "reviewed" | "resolved";

export interface IReport extends Document {
  reporter: mongoose.Types.ObjectId;
  reportedUser: mongoose.Types.ObjectId;
  reason: string;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema: Schema<IReport> = new Schema<IReport>(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reportedUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ReportSchema.pre("validate", function enforceDistinctUsers(this: IReport) {
  if (this.reporter?.toString() === this.reportedUser?.toString()) {
    throw new Error("Reporter and reported user must be different");
  }
});

ReportSchema.index({ reportedUser: 1, status: 1, createdAt: -1 });

export const ReportModel = mongoose.model<IReport>("Report", ReportSchema);
