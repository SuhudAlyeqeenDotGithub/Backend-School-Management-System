import mongoose, { Schema, model } from "mongoose";

const syllabusSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    syllabus: { type: String, required: true },
    description: { type: String },
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: "Programme", required: true },
    pathwayId: { type: mongoose.Schema.Types.ObjectId, ref: "Pathway", default: null },
    baseSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "BaseSubject", required: true },
    startDate: { type: String },
    endDate: { type: String },
    status: { type: String, required: true, enum: ["Offering", "Not Offering"] },
    searchText: { type: String, required: true },
    topics: [{ topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" } }],
    learningOutcomes: [{ type: String }],
    notes: { type: String }
  },
  { timestamps: true }
);

syllabusSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

export const Syllabus = model("Syllabus", syllabusSchema);

const schemeOfWorkSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    schemeOfWork: { type: String, required: true },
    description: { type: String },
    classSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    syllabusId: { type: mongoose.Schema.Types.ObjectId, ref: "Syllabus", required: true },
    status: { type: String, required: true, enum: ["Offering", "Not Offering"] },
    searchText: { type: String, required: true },
    topics: [{ topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" }, week: String }],
    learningOutcomes: [{ type: String }],
    notes: { type: String }
  },
  { timestamps: true }
);

schemeOfWorkSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

export const SchemeOfWork = model("SchemeOfWork", schemeOfWorkSchema);
