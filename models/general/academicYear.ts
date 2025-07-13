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

export const AcademicYear = model("AcademicYear", academicYearSchema);
