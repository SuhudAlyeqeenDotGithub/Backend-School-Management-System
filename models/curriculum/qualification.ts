import mongoose from "mongoose";
const { Schema, model } = mongoose;
const qualificationSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },

    qualification: { type: String, required: true },
    qualificationType: { type: String, required: true },
    level: { type: Number },
    awardingBody: { type: String },

    description: { type: String },
    duration: { type: String },
    status: { type: String, enum: ["Offering", "Not Offering"], required: true },

    searchText: { type: String, required: true }
  },
  { timestamps: true }
);

qualificationSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

export const Qualification = model("Qualification", qualificationSchema);
