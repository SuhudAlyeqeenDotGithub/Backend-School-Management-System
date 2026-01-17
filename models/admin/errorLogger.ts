import mongoose, { Schema, model } from "mongoose";

const errorLoggerSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: false },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: false },
    status: { type: Number, required: true },
    level: { type: String, required: true }, 
    route: { type: String, required: true },
    model: { type: String, required: true, default: "None" },
    name: { type: String },
    message: { type: String, required: true }
  },
  { timestamps: true }
);

export const ErrorLogger = model("ErrorLogger", errorLoggerSchema);
