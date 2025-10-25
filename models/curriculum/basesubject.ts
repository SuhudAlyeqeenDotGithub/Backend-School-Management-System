import mongoose from "mongoose";
const { Schema, model } = mongoose;

const baseSubjectSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    baseSubjectCustomId: { type: String, unique: true },
    baseSubjectName: { type: String, required: true },
    description: { type: String },
    offeringStartDate: { type: String, required: true },
    offeringEndDate: { type: String },
    searchText: { type: String, required: true },
    status: { type: String, required: true, enum: ["Active", "Inactive"] }
  },
  { timestamps: true }
);

baseSubjectSchema.index({ organisationId: 1, baseSubjectCustomId: 1 }, { unique: true });

export const BaseSubject = model("BaseSubject", baseSubjectSchema);

const baseSubjectManagerSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    baseSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "BaseSubject", required: true },
    baseSubjectName: { type: String, required: true },
    baseSubjectCustomId: { type: String, required: true },
    baseSubjectManagerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    baseSubjectManagerCustomStaffId: { type: String, required: true },
    baseSubjectManagerFullName: { type: String, required: true },
    managedFrom: { type: String, required: true },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

baseSubjectManagerSchema.index(
  { organisationId: 1, baseSubjectId: 1, baseSubjectManagerCustomStaffId: 1, status: 1 },
  { unique: true }
);

export const BaseSubjectManager = model("BaseSubjectManager", baseSubjectManagerSchema);
