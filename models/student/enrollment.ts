import mongoose from "mongoose";
import path from "path";
const { Schema, model } = mongoose;

const studentEnrollmentSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true, required: true },
    status: { type: String, required: true, enum: ["Active", "Completed", "Withdrawn"] },
    enrollmentDate: { type: String, required: true },
    enrollmentExpiresOn: { type: String },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway", default: null },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    enrollmentType: { type: String, required: true, enum: ["New", "Re-enrollement", "Transfer", "Return"] },
    notes: { type: String },
    allowances: { type: [{ _id: String, allowanceType: String, amount: Number, notes: String, grantedDate: String }] },
    searchText: { type: String, required: true },
    completionStatus: { String }
  },
  { timestamps: true }
);

studentEnrollmentSchema.index({ organisationId: 1, customId: 1 });
studentEnrollmentSchema.index({ organisationId: 1, programmeId: 1, pathwayId: 1, classId: 1, academicYearId: 1 });
studentEnrollmentSchema.index(
  { organisationId: 1, studentId: 1, classId: 1, academicYearId: 1, enrollmentType: 1, status: 1 },
  { unique: true }
);

export const StudentEnrollment = model("StudentEnrollment", studentEnrollmentSchema);
