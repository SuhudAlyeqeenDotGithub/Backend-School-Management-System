import mongoose from "mongoose";
const { Schema, model } = mongoose;

const activityLogSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    logAction: { type: String, required: true },
    recordModel: {
      type: String,
      required: true,
      enum: [
        "Course",
        "Student",
        "StudentEnrollment",
        "Staff",
        "Programme",
        "Subject",
        "Account",
        "Role",
        "Staff",
        "Level",
        "Enrollment",
        "Attendance",
        "AcademicYear",
        "StaffContract",
        "ProgrammeManager",
        "CourseManager",
        "LevelManager",
        "SubjectTeacher",
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
