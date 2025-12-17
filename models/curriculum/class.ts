import mongoose from "mongoose";
const { Schema, model } = mongoose;

const classSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    className: { type: String, required: true },
    classFullTitle: { type: String, required: true },
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway" },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    description: { type: String },
    startDate: { type: String, required: true },
    endDate: { type: String },
    qualifications: [{ type: mongoose.Schema.Types.ObjectId, ref: "Qualification" }],
    status: { type: String, required: true, enum: ["Offering", "Not Offering"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

classSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

export const Class = model("Class", classSchema);

const classTutorSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    tutorFullName: { type: String, required: true },
    managedFrom: { type: String, required: true },
    tutorType: { type: String, required: true, enum: ["Main", "Assistant"], default: "Main" },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

classTutorSchema.index({ organisationId: 1, classId: 1, staffId: 1, status: 1 }, { unique: true });
// classTutorSchema.index({ organisationId: 1, classTutorStaffId: 1, status: 1 });
// classTutorSchema.index({ organisationId: 1, classId: 1, classTutorCustomStaffId: 1 });
export const ClassTutor = model("ClassTutor", classTutorSchema);
