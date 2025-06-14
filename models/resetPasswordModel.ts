import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const resetPasswordSchema = new Schema({
  accountEmail: { type: String, required: true },
  resetCode: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

export const ResetPassword = model("ResetPassword", resetPasswordSchema);
