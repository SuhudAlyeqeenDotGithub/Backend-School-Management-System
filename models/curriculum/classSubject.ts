import mongoose from "mongoose";
const { Schema, model } = mongoose;

const classSubjectSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    classSubject: { type: String, required: true },
    baseSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "BaseSubject", required: true },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway" },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    description: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    status: { type: String, required: true, enum: ["Offering", "Not Offering"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

classSubjectSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

export const ClassSubject = model("ClassSubject", classSubjectSchema);

const classSubjectTeacherSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    classSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    teacherFullName: { type: String, required: true },
    teacherType: { type: String, required: true, enum: ["Main", "Assistant"], default: "Main" },
    managedFrom: { type: String, required: true },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

classSubjectTeacherSchema.index({ organisationId: 1, classSubjectId: 1, staffId: 1, status: 1 }, { unique: true });

export const ClassSubjectTeacher = model("ClassSubjectTeacher", classSubjectTeacherSchema);
