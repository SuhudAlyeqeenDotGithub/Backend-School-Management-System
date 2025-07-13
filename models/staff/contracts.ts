import mongoose from "mongoose";
const { Schema, model } = mongoose;

const staffContractSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    staffId: { type: String, required: true },
    academicYear: { type: String, required: true },
    staffCustomId: { type: String, required: true, unique: true },
    staffFullName: { type: String, required: true },
    jobTitle: { type: String, required: true },
    contractStartDate: { type: String, required: true },
    contractEndDate: { type: String },
    responsibilities: { type: [{ responsibility: String, description: String }], required: true },
    searchText: { type: String, required: true },
    contractType: { type: String, required: true, enum: ["Full-time", "Part-time"] },
    contractStatus: { type: String, required: true, enum: ["Active", "Closed"] },
    contractSalary: { type: String, required: true, default: "0.00" },
    workingSchedule: { type: [{ day: String, startTime: String, endTime: String, hours: String }], required: true }
  },
  { timestamps: true }
);

export const StaffContract = model("StaffContract", staffContractSchema);
