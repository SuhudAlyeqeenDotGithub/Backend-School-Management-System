import { Schema, model } from "mongoose";

const verificationCodeSchema = new Schema(
  {
    email: { type: String, required: true },
    verificationCode: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

export const VerificationCode = model("VerificationCode", verificationCodeSchema);
