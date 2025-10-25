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

programmeSchema.index({ organisationId: 1, programmeCustomId: 1 }, { unique: true });


export const Programme = model("Programme", programmeSchema);

const programmeManagerSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    programmeName: { type: String, required: true },
    programmeCustomId: { type: String, required: true },
    programmeManagerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    programmeManagerCustomStaffId: { type: String, required: true },
    programmeManagerFullName: { type: String, required: true },
    managedFrom: { type: String, required: true },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

programmeManagerSchema.index(
  { organisationId: 1, programmeId: 1, programmeManagerCustomStaffId: 1, status: 1 },
  { unique: true }
);


export const ProgrammeManager = model("ProgrammeManager", programmeManagerSchema);
