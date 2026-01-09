import mongoose from "mongoose";
const { Schema, model } = mongoose;

const featuresSchema = new Schema(
  {
    name: { type: String, required: true },
    introductoryPrice: { type: Number, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    requirements: { type: [String], required: true },
    mandatory: { type: Boolean, required: true },
    tabs: { type: [String], required: true },
    availability: { type: String, required: true, enum: ["Available", "Launching Soon", "Unavailable"] },
    introductoryMonths: { type: Number, default: 5 },

  },
  { timestamps: true }
);

export const Feature = model("Feature", featuresSchema);
