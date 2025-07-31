import { Schema, model } from "mongoose";
import { generateSearchText } from "../../utils/utilsFunctions";

const academicYearSchema = new Schema({
  organisationId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  academicYear: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  searchText: {
    type: String,
    required: true
  }
});

academicYearSchema.index({ organisationId: 1 });
academicYearSchema.index({ academicYear: 1, organisationId: 1 });
academicYearSchema.index({ searchText: 1 });

export const AcademicYear = model("AcademicYear", academicYearSchema);
