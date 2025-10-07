import mongoose from "mongoose";
const { Schema, model } = mongoose;

const programmeSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    programmeCustomId: { type: String, unique: true },
    programmeName: { type: String, required: true },
    description: { type: String },
    offeringStartDate: { type: String, required: true },
    offeringEndDate: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true },
    programmeDuration: { type: String }
  },
  { timestamps: true }
);

programmeSchema.index({ organisationId: 1 });
programmeSchema.index({ organisationId: 1, programmeCustomId: 1 }, { unique: true });
programmeSchema.index({ searchText: 1 });

export const Programme = model("Programme", programmeSchema);
