import mongoose from "mongoose";
const { Schema, model } = mongoose;

const studentDayAttendanceTemplateSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, required: true },
    takenOn: { type: Date, required: true },
    status: { type: String, required: true, enum: ["Completed", "In Progress", "Cancelled"] },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway", default: null },
    takenBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    notes: { type: String },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

studentDayAttendanceTemplateSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

studentDayAttendanceTemplateSchema.virtual("studentDayAttendances", {
  ref: "StudentDayAttendance",
  localField: "_id",
  foreignField: "attendanceTemplateId"
});

studentDayAttendanceTemplateSchema.set("toObject", { virtuals: true });
studentDayAttendanceTemplateSchema.set("toJSON", { virtuals: true });
studentDayAttendanceTemplateSchema.index({ organisationId: 1, programmeId: 1, pathwayId: 1, classId: 1 });
export const StudentDayAttendanceTemplate = model("StudentDayAttendanceTemplate", studentDayAttendanceTemplateSchema);

const studentDayAttendanceSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    attendanceTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentDayAttendanceTemplate", required: true },
    takenOn: { type: Date, required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
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
studentDayAttendanceSchema.index({ organisationId: 1, attendanceTemplateId: 1 });
studentDayAttendanceSchema.index({ organisationId: 1, attendanceTemplateId: 1, studentId: 1 }, { unique: true });

export const StudentDayAttendance = model("StudentDayAttendance", studentDayAttendanceSchema);
