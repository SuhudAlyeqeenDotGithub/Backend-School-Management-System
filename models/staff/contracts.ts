import mongoose from "mongoose";
const { Schema, model } = mongoose;

const staffContractSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    staffId: { type: String, required: true },
    academicYear: { type: String, required: true },
    staffCustomId: { type: String, required: true },
    contractCustomId: { type: String, required: true },
    staffFullName: { type: String, required: true },
    jobTitle: { type: String, required: true },
    contractStartDate: { type: String, required: true },
    contractEndDate: String,
    responsibilities: {
      type: [{ _id: String, role: String, responsibility: String, description: String }],
      required: true
    },
    searchText: { type: String, required: true },
    contractType: {
      type: String,
      required: true,
      enum: ["Full-time", "Part-time", "Casual", "Internship", "Fixed-term"]
    },
    reportingManagerCustomId: String,
    probationStartDate: String,
    probationEndDate: String,
    probationMonths: Number,
    contractStatus: { type: String, required: true, enum: ["Active", "Closed"] },
    department: String,
    contractSalary: { type: Number, required: true, default: "0.00" },
    payFrequency: String,
    allowances: {
      type: [{ _id: String, allowanceType: String, amount: String }],
      required: true
    },
    terminationNoticePeriod: String,
    workingSchedule: {
      type: [{ _id: String, day: String, startTime: String, endTime: String, hours: String }],
      required: true
    }
  },
  { timestamps: true }
);

staffContractSchema.index({ organisationId: 1, staffCustomId: 1 });
staffContractSchema.index({ staffId: 1, contractStatus: 1 });

export const StaffContract = model("StaffContract", staffContractSchema);
