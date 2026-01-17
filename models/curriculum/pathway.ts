import mongoose, { Schema, model } from "mongoose";

const pathwaySchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    pathway: { type: String, required: true },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    description: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    status: { type: String, required: true, enum: ["Offering", "Not Offering"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

pathwaySchema.index({ organisationId: 1, customId: 1 }, { unique: true });
export const Pathway = model("Pathway", pathwaySchema);

const pathwayManagerSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    managerFullName: { type: String, required: true },
    managedFrom: { type: String, required: true },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

pathwayManagerSchema.index({ organisationId: 1, pathwayId: 1, staffId: 1, status: 1 }, { unique: true });
pathwayManagerSchema.index({ organisationId: 1, staffId: 1, status: 1 });
// pathwayManagerSchema.index({ organisationId: 1, pathwayId: 1, customStaffId: 1 });
export const PathwayManager = model("PathwayManager", pathwayManagerSchema);
