import mongoose, { Schema, model } from "mongoose";

const classSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    className: { type: String, required: true },
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway", default: null },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    description: { type: String },
    qualification: { String },
    awardingBody: { type: String },
    progressionOutcome: { type: String, required: true },
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "BaseSubject" }],
    status: { type: String, required: true, enum: ["Offering", "Not Offering"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

classSchema.index({ organisationId: 1, customId: 1 }, { unique: true });
classSchema.index({ organisationId: 1, className: 1, programmeId: 1, pathwayId: 1 }, { unique: true });
classSchema.index({ organisationId: 1, classId: 1, programmeId: 1, pathwayId: 1 });

export const Class = model("Class", classSchema);

const classTutorSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    tutorFullName: { type: String, required: true },
    managedFrom: { type: String, required: true },
    managementType: { type: String, required: true, enum: ["Main", "Assistant"], default: "Main" },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

classTutorSchema.index({ organisationId: 1, classId: 1, staffId: 1, status: 1 }, { unique: true });

classTutorSchema.index({ organisationId: 1, staffId: 1, status: 1 });
export const ClassTutor = model("ClassTutor", classTutorSchema);
