import mongoose from "mongoose";
const { Schema, model } = mongoose;

const activityLogSchema = new Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId },
  logAction: { type: String, required: true },
  recordId: { type: String, required: true },
  recordName: String,
  loggedDate: { type: Date, default: Date.now, required: true }
});

export const ActivityLog = model("ActivityLog", activityLogSchema);
