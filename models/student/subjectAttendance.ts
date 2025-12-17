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
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway", required: true },
    pathwayCustomId: { type: String, required: true },
    pathwayFullTitle: { type: String, required: true },
    pathwayManagerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    pathwayManagerCustomStaffId: { type: String, required: true },
    pathwayManagerFullName: { type: String, required: true },

    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    subjectCustomId: { type: String, required: true },
    subjectFullTitle: { type: String, required: true },
    subjectTeacherStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    subjectTeacherCustomStaffId: { type: String, required: true },
    subjectTeacherFullName: { type: String, required: true },

    classManagerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    classManagerCustomStaffId: { type: String, required: true },
    classManagerFullName: { type: String, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    classCustomId: { type: String, required: true },
    class: { type: String, required: true },
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
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway", required: true },
    class: { type: String, required: true },
    pathwayFullTitle: { type: String, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
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
