import mongoose from "mongoose";
const { Schema, model } = mongoose;

const subjectSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    subjectCustomId: { type: String, unique: true },
    subjectFullTitle: { type: String, required: true },
    subject: { type: String, required: true },
    baseSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "BaseSubject", required: true },
    baseSubjectCustomId: { type: String, required: true },
    baseSubjectName: { type: String },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    courseCustomId: { type: String, required: true },
    courseFullTitle: { type: String },
    levelId: { type: mongoose.Schema.Types.ObjectId, ref: "Level", required: true },
    levelCustomId: { type: String, required: true },
    level: { type: String },
    description: { type: String },
    offeringStartDate: { type: String, required: true },
    offeringEndDate: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

subjectSchema.index({ organisationId: 1, subjectCustomId: 1 }, { unique: true });


export const Subject = model("Subject", subjectSchema);

const subjectTeacherSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    subjectFullTitle: { type: String, required: true },
    subjectCustomId: { type: String, required: true },
    subjectTeacherStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    subjectTeacherCustomStaffId: { type: String, required: true },
    subjectTeacherFullName: { type: String, required: true },
    staffType: { type: String, required: true, enum: ["Main", "Assistant"], default: "Main" },
    managedFrom: { type: String, required: true },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

subjectTeacherSchema.index(
  { organisationId: 1, subjectId: 1, subjectTeacherCustomStaffId: 1, status: 1 },
  { unique: true }
);

export const SubjectTeacher = model("SubjectTeacher", subjectTeacherSchema);
