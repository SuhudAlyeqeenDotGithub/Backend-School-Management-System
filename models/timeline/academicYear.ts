import { Schema, model } from "mongoose";

const academicYearSchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    academicYear: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true }
  },
  { timestamps: true }
);

academicYearSchema.virtual("periods", {
  ref: "Period",
  localField: "_id",
  foreignField: "academicYearId"
});

academicYearSchema.set("toObject", { virtuals: true });
academicYearSchema.set("toJSON", { virtuals: true });

academicYearSchema.index({ organisationId: 1, academicYear: 1 }, { unique: true });


export const AcademicYear = model("AcademicYear", academicYearSchema);
