import mongoose, { Schema, model } from "mongoose";

const stageSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String },
    stage: { type: String, required: true },
    description: { type: String },
    searchText: { type: String, required: true },
    duration: { type: String }
  },
  { timestamps: true }
);

stageSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

export const Stage = model("Stage", stageSchema);
