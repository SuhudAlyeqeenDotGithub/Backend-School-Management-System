import { Schema, model } from "mongoose";
import { generateSearchText } from "../../utils/utilsFunctions.ts";

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

academicYearSchema.index({ organisationId: 1 });
academicYearSchema.index({ academicYear: 1, organisationId: 1 }, { unique: true });
academicYearSchema.index({ searchText: 1 });

export const AcademicYear = model("AcademicYear", academicYearSchema);
