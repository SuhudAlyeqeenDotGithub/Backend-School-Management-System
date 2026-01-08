import mongoose from "mongoose";
const { Schema, model } = mongoose;

const staffContractSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    staffId: { type: String, required: true },
    staffFullName: { type: String, required: true },
    customId: { type: String, required: true },
    jobTitle: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: String,
    responsibilities: {
      type: [{ _id: String, role: String, responsibility: String, description: String }],
      required: true
    },
    searchText: { type: String, required: true },
    contractType: {
      type: String,
      required: true
    },
    managerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", default: null },
    probationStartDate: String,
    probationEndDate: String,
    probationMonths: Number,
    status: { type: String, required: true, enum: ["Active", "Closed"] },
    department: String,
    salary: { type: String, required: true },
    payFrequency: String,
    allowances: { type: [{ _id: String, allowanceType: String, amount: Number, notes: String, grantedDate: String }] },
    terminationNoticePeriod: String,
    workingSchedule: {
      type: [{ _id: String, day: String, startTime: String, endTime: String, hours: String }],
      required: true
    }
  },
  { timestamps: true }
);

staffContractSchema.index({ organisationId: 1, staffId: 1 });
staffContractSchema.index({ staffId: 1, status: 1 });

export const StaffContract = model("StaffContract", staffContractSchema);
