import mongoose from "mongoose";
const { Schema, model } = mongoose;

const syllabusSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    syllabusCustomId: { type: String, unique: true },
    syllabus: { type: String, required: true },
    description: { type: String },
    offeringStartDate: { type: String },
    subjectFullTitle: { type: String, required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    courseCustomId: { type: String, required: true },
    levelId: { type: mongoose.Schema.Types.ObjectId, ref: "Level", required: true },
    levelCustomId: { type: String, required: true },
    baseSubjectCustomId: { type: String, required: true },
    subjectCustomId: { type: String, required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    offeringEndDate: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true },
    topics: [{ topicId: String, week: String, topicCustomId: String, topic: String }],
    learningOutcomes: [{ type: String }],
    notes: { type: String }
  },
  { timestamps: true }
);

syllabusSchema.index({ organisationId: 1, syllabusCustomId: 1 }, { unique: true });


export const Syllabus = model("Syllabus", syllabusSchema);
