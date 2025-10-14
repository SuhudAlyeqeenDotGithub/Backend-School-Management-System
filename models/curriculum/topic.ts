import mongoose from "mongoose";
const { Schema, model } = mongoose;

const topicSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    topicCustomId: { type: String, unique: true },
    topic: { type: String, required: true },
    description: { type: String },
    offeringStartDate: { type: String },
    offeringEndDate: { type: String },
    status: { type: String, required: true, enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true },
    resources: [{ _id: String, resourceType: String, resourceName: String, url: String }],
    learningObjectives: [{ type: String }]
  },
  { timestamps: true }
);

topicSchema.index({ organisationId: 1, topicCustomId: 1 }, { unique: true });
topicSchema.index({ searchText: 1 });
topicSchema.index({ status: 1 });

export const Topic = model("Topic", topicSchema);
