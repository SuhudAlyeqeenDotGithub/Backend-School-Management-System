import mongoose from "mongoose";
const { Schema, model } = mongoose;

const studentSubjectAttendanceTemplateSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    attendanceCustomId: { type: String, unique: true, required: true },
    attendanceDate: { type: String, required: true },
    attendanceStatus: { type: String, required: true, enum: ["Completed", "In Progress", "Cancelled"] },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    academicYear: { type: String, required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    courseCustomId: { type: String, required: true },
    courseFullTitle: { type: String, required: true },
    courseManagerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    courseManagerCustomStaffId: { type: String, required: true },
    courseManagerFullName: { type: String, required: true },

    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    subjectCustomId: { type: String, required: true },
    subjectFullTitle: { type: String, required: true },
    subjectTeacherStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    subjectTeacherCustomStaffId: { type: String, required: true },
    subjectTeacherFullName: { type: String, required: true },

    levelManagerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    levelManagerCustomStaffId: { type: String, required: true },
    levelManagerFullName: { type: String, required: true },
    levelId: { type: mongoose.Schema.Types.ObjectId, ref: "Level", required: true },
    levelCustomId: { type: String, required: true },
    level: { type: String, required: true },
    notes: { type: String },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

studentSubjectAttendanceTemplateSchema.index({ organisationId: 1, attendanceCustomId: 1 });

studentSubjectAttendanceTemplateSchema.virtual("studentSubjectAttendances", {
  ref: "StudentSubjectAttendanceStore",
  localField: "_id",
  foreignField: "attendanceId"
});

studentSubjectAttendanceTemplateSchema.set("toObject", { virtuals: true });
studentSubjectAttendanceTemplateSchema.set("toJSON", { virtuals: true });

export const StudentSubjectAttendanceTemplate = model(
  "StudentSubjectAttendanceTemplate",
  studentSubjectAttendanceTemplateSchema
);

const studentSubjectAttendanceStoreSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    attendanceCustomId: { type: String, required: true },
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentSubjectAttendanceTemplate", required: true },
    attendanceDate: { type: String, required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    level: { type: String, required: true },
    courseFullTitle: { type: String, required: true },
    levelId: { type: mongoose.Schema.Types.ObjectId, ref: "Level", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    subjectFullTitle: { type: String, required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    studentCustomId: { type: String, required: true },
    studentFullName: { type: String, required: true },
    attendance: {
      type: String,
      required: true,
      enum: ["Present", "Late (Excused)", "Late (Unexcused)", "Absent (Excused)", "Absent (Unexcused)"]
    }
  },
  { timestamps: true }
);

studentSubjectAttendanceStoreSchema.index({ organisationId: 1, attendanceId: 1 });

export const StudentSubjectAttendanceStore = model(
  "StudentSubjectAttendanceStore",
  studentSubjectAttendanceStoreSchema
);
