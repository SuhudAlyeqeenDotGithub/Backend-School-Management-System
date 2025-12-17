import mongoose from "mongoose";
const { Schema, model } = mongoose;

const topicSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    topic: { type: String, required: true },
    description: { type: String },
    status: { type: String, required: true, enum: ["Offering", "Not Offering"] },
    searchText: { type: String, required: true },
    resources: [{ _id: String, resourceType: String, resourceName: String, url: String }],
    learningObjectives: [{ type: String }]
  },
  { timestamps: true }
);

topicSchema.index({ organisationId: 1, topicCustomId: 1 }, { unique: true });

export const Topic = model("Topic", topicSchema);
