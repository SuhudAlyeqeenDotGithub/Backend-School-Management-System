import mongoose from "mongoose";
const { Schema, model } = mongoose;

const staffContractSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    staffId: { type: String, required: true },
    academicYear: { type: String, required: true },
    staffCustomId: { type: String, required: true },
    staffFullName: { type: String, required: true },
    jobTitle: { type: String, required: true },
    contractStartDate: { type: String, required: true },
    contractEndDate: { type: String },
    responsibilities: { type: [{ _id: String, responsibility: String, description: String }], required: true },
    searchText: { type: String, required: true },
    contractType: { type: String, required: true, enum: ["Full-time", "Part-time"] },
    contractStatus: { type: String, required: true, enum: ["Active", "Closed"] },
    contractSalary: { type: String, required: true, default: "0.00" },
    workingSchedule: {
      type: [{ _id: String, day: String, startTime: String, endTime: String, hours: String }],
      required: true
    }
  },
  { timestamps: true }
);

staffContractSchema.index({ organisationId: 1 });
staffContractSchema.index({ academicYear: 1 });
staffContractSchema.index({ organisationId: 1, staffCustomId: 1 });
staffContractSchema.index({ contractType: 1 });
staffContractSchema.index({ contractStatus: 1 });
staffContractSchema.index({ jobTitle: 1 });
staffContractSchema.index({ staffFullName: 1 });
staffContractSchema.index({ searchText: 1 });

export const StaffContract = model("StaffContract", staffContractSchema);
