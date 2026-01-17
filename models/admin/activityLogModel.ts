import mongoose, { Schema, model } from "mongoose";

const activityLogSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    logAction: { type: String, required: true },
    recordModel: {
      type: String,
      required: true,
      enum: [
        "Pathway",
        "Student",
        "StudentEnrollment",
        "Staff",
        "Programme",
        "Qualification",
        "ClassSubject",
        "Account",
        "Role",
        "Staff",
        "Class",
        "Enrollment",
        "Attendance",
        "AcademicYear",
        "Period",
        "StaffContract",
        "ProgrammeManager",
        "PathwayManager",
        "ClassTutor",
        "ClassSubjectTeacher",
        "BaseSubject",
        "BaseSubjectManager",
        "StudentDayAttendanceTemplate",
        "StudentSubjectAttendanceTemplate",
        "StudentEventAttendanceTemplate",
        "Topic",
        "Syllabus",
        "Feature",
        "Stage",
        "None"
      ]
    },
    recordId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "recordModel" },
    recordName: String,
    searchText: { type: String, required: true },
    recordChange: { type: [], required: true },
    logDate: { type: Date, default: Date.now, required: true }
  },
  { timestamps: true }
);

activityLogSchema.index({ updatedAt: -1, _id: -1 });
export const ActivityLog = model("ActivityLog", activityLogSchema);
