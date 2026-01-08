import { Schema, model } from "mongoose";

const periodSchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    customId: { type: String, required: true },
    period: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true }
  },
  { timestamps: true }
);

periodSchema.index({ academicYearId: 1, period: 1 }, { unique: true });

export const Period = model("Period", periodSchema);
