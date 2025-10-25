import mongoose from "mongoose";
const { Schema, model } = mongoose;

const courseSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    courseCustomId: { type: String, unique: true },
    courseName: { type: String, required: true },
    courseFullTitle: { type: String, required: true },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    programmeCustomId: { type: String, required: true },
    programmeName: { type: String },
    description: { type: String },
    offeringStartDate: { type: String, required: true },
    offeringEndDate: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true },
    courseDuration: { type: String }
  },
  { timestamps: true }
);

courseSchema.index({ organisationId: 1, courseCustomId: 1 }, { unique: true });

export const Course = model("Course", courseSchema);

const courseManagerSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    courseFullTitle: { type: String, required: true },
    courseCustomId: { type: String, required: true },
    courseManagerStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    courseManagerCustomStaffId: { type: String, required: true },
    courseManagerFullName: { type: String, required: true },
    managedFrom: { type: String, required: true },
    managedUntil: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

courseManagerSchema.index(
  { organisationId: 1, courseId: 1, courseManagerCustomStaffId: 1, status: 1 },
  { unique: true }
);
courseManagerSchema.index({ organisationId: 1, courseId: 1, courseManagerCustomStaffId: 1 });
courseManagerSchema.index({ organisationId: 1, courseManagerStaffId: 1, status: 1 });

export const CourseManager = model("CourseManager", courseManagerSchema);
