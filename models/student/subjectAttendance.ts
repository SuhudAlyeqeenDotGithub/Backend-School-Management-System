import mongoose from "mongoose";
const { Schema, model } = mongoose;

const studentSubjectAttendanceTemplateSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, required: true },
    takenOn: { type: Date, required: true },
    status: { type: String, required: true, enum: ["Completed", "In Progress", "Cancelled"] },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    baseSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "BaseSubject", required: true },
    classSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "ClassSubject", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway", default: null },
    takenBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    notes: { type: String },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

studentSubjectAttendanceTemplateSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

studentSubjectAttendanceTemplateSchema.virtual("studentSubjectAttendances", {
  ref: "StudentSubjectAttendance",
  localField: "_id",
  foreignField: "attendanceTemplateId"
});

studentSubjectAttendanceTemplateSchema.set("toObject", { virtuals: true });
studentSubjectAttendanceTemplateSchema.set("toJSON", { virtuals: true });

studentSubjectAttendanceTemplateSchema.index({
  organisationId: 1,
  programmeId: 1,
  pathwayId: 1,
  classId: 1,
  baseSubjectId: 1,
  classSubjectId: 1
});

export const StudentSubjectAttendanceTemplate = model(
  "StudentSubjectAttendanceTemplate",
  studentSubjectAttendanceTemplateSchema
);

const studentSubjectAttendanceSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    attendanceTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentSubjectAttendanceTemplate",
      required: true
    },
    takenOn: { type: Date, required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    baseSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "BaseSubject", required: true },
    classSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "ClassSubject", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway", default: null },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    studentCustomId: { type: String, required: true },
    fullName: { type: String, required: true },
    studentAttendanceStatus: {
      type: String,
      required: true,
      enum: [
        "Present",
        "Late (Excused)",
        "Late (Unexcused)",
        "Absent (Excused)",
        "Absent (Unexcused)",
        "Left Early (Excused)",
        "Left Early (Unexcused)",
        "Off-site"
      ]
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 200
    }
  },
  { timestamps: true }
);
studentSubjectAttendanceSchema.index({ organisationId: 1, attendanceTemplateId: 1 });
studentSubjectAttendanceSchema.index({ organisationId: 1, attendanceTemplateId: 1, studentId: 1 }, { unique: true });

export const StudentSubjectAttendance = model("StudentSubjectAttendance", studentSubjectAttendanceSchema);
