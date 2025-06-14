import mongoose from "mongoose";
const { Schema, model } = mongoose;

const activityLogSchema = new Schema({
  organisationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
  logAction: { type: String, required: true },
  recordModel: {
    type: String,
    required: true,
    enum: [
      "Course",
      "Student",
      "Staff",
      "Subject",
      "Account",
      "Role",
      "Staff",
      "Level",
      "Enrollment",
      "Attendance",
      "None"
    ]
  },
  recordId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "recordModel" },

  recordName: String,
  recordChange: { type: [], required: true },
  logDate: { type: Date, default: Date.now, required: true }
});

export const ActivityLog = model("ActivityLog", activityLogSchema);
