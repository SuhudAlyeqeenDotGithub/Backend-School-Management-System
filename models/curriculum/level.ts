import mongoose from "mongoose";
const { Schema, model } = mongoose;

const levelSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    levelCustomId: { type: String, unique: true },
    level: { type: String, required: true },
    levelFullTitle: { type: String, required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    courseCustomId: { type: String, required: true },
    courseFullTitle: { type: String },
    description: { type: String },
    offeringStartDate: { type: String, required: true },
    offeringEndDate: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true },
    levelDuration: { type: String }
  },
  { timestamps: true }
);

levelSchema.index({ organisationId: 1, levelCustomId: 1 }, { unique: true });

export const Level = model("Level", levelSchema);

const levelManagerSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    levelId: { type: mongoose.Schema.Types.ObjectId, ref: "Level", required: true },
    levelFullTitle: { type: String, required: true },
    levelCustomId: { type: String, required: true },
    levelManagerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    levelManagerCustomStaffId: { type: String, required: true },
    levelManagerFullName: { type: String, required: true },
    managedFrom: { type: String, required: true },
    staffType: { type: String, required: true, enum: ["Main", "Assistant"], default: "Main" },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

levelManagerSchema.index({ organisationId: 1, levelId: 1, levelManagerCustomStaffId: 1, status: 1 }, { unique: true });
levelManagerSchema.index({ organisationId: 1, levelManagerStaffId: 1, status: 1 });
levelManagerSchema.index({ organisationId: 1, levelId: 1, levelManagerCustomStaffId: 1 });
export const LevelManager = model("LevelManager", levelManagerSchema);
