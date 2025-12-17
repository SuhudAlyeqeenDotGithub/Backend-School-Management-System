import mongoose from "mongoose";
const { Schema, model } = mongoose;

const baseSubjectSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    baseSubject: { type: String, required: true },
    description: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    searchText: { type: String, required: true },
    status: { type: String, required: true, enum: ["Offering", "Not Offering"] }
  },
  { timestamps: true }
);

baseSubjectSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

export const BaseSubject = model("BaseSubject", baseSubjectSchema);

const baseSubjectManagerSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    baseSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "BaseSubject", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    managerFullName: { type: String, required: true },
    managedFrom: { type: String, required: true },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

baseSubjectManagerSchema.index({ organisationId: 1, baseSubjectId: 1, staffId: 1, status: 1 }, { unique: true });

export const BaseSubjectManager = model("BaseSubjectManager", baseSubjectManagerSchema);
