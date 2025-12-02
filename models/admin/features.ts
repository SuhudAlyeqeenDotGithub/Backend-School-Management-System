import mongoose from "mongoose";
const { Schema, model } = mongoose;

const featuresSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    requirements: { type: [String], required: true },
    mandatory: { type: Boolean, required: true }
  },
  { timestamps: true }
);

export const Feature = model("Feature", featuresSchema);
