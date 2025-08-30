import mongoose from "mongoose";
const { Schema, model } = mongoose;

const subscriptionSchema = new Schema(
  {
    subscriptionType: { type: String, enum: ["Freemium", "Premium"], required: true },
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    freemiumStartDate: { type: Date, required: true },
    freemiumEndDate: { type: Date, required: true },
    premiumStartDate: { type: Date },
    premiumEndDate: { type: Date },
    subscriptionStatus: { type: String, required: true, enum: ["Active", "Inactive"], default: "Active" },
    billingAddress: { type: String, required: true, default: "Organisation Address" },
    billingPostcode: { type: String, default: "Organisation PostCode" },
    paymentDetails: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const Subscription = model("Subscription", subscriptionSchema);
