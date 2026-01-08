import mongoose from "mongoose";
const { Schema, model } = mongoose;

const programmeSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    programme: { type: String, required: true },
    stageId: { type: mongoose.Schema.Types.ObjectId, ref: "Stage" },
    description: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    status: { type: String, required: true, enum: ["Offering", "Not Offering"] },
    searchText: { type: String, required: true },
    duration: { type: String }
  },
  { timestamps: true }
);

programmeSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

export const Programme = model("Programme", programmeSchema);

const programmeManagerSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    managerFullName: { type: String, required: true },
    managedFrom: { type: String, required: true },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

programmeManagerSchema.index({ organisationId: 1, programmeId: 1, staffId: 1, status: 1 }, { unique: true });
programmeManagerSchema.index({ organisationId: 1, staffId: 1, status: 1 });

export const ProgrammeManager = model("ProgrammeManager", programmeManagerSchema);
