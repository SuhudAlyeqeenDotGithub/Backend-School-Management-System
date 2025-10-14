import mongoose from "mongoose";
const { Schema, model } = mongoose;

const studentEnrollmentSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    enrollmentCustomId: { type: String, unique: true },
    studentCustomId: { type: String },
    enrollmentStatus: { type: String, required: true, enum: ["Active", "Completed", "Withdrawn"] },
    enrollmentDate: { type: String, required: true },
    enrollmentExpiresOn: { type: String },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    studentFullName: { type: String, required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    academicYear: { type: String, required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    courseCustomId: { type: String, required: true },
    enrollmentType: { type: String, required: true, enum: ["New", "Re-enrolled", "Transfer", "Returned"] },
    courseFullTitle: { type: String, required: true },
    levelId: { type: mongoose.Schema.Types.ObjectId, ref: "Level", required: true },
    levelCustomId: { type: String, required: true },
    level: { type: String, required: true },
    notes: { type: String },
    allowances: { type: String },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

studentEnrollmentSchema.index({ organisationId: 1, enrollmentCustomId: 1 });
studentEnrollmentSchema.index({ studentCustomId: 1, organisationId: 1 });
studentEnrollmentSchema.index({ academicYearId: 1, organisationId: 1 });
studentEnrollmentSchema.index({ enrollmentType: 1 });
studentEnrollmentSchema.index({ enrollmentStatus: 1 });
studentEnrollmentSchema.index({ searchText: 1 });

export const StudentEnrollment = model("StudentEnrollment", studentEnrollmentSchema);
