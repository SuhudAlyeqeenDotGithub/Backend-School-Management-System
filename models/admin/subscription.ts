import mongoose from "mongoose";
const { Schema, model } = mongoose;

const subscriptionSchema = new Schema(
  {
    subscriptionType: { type: String, enum: ["Freemium", "Premium"], required: true },
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    freemiumStartDate: { type: Date, required: true },
    freemiumEndDate: { type: Date, required: true },
    premiumStartDate: { type: Date, required: true },
    premiumEndDate: { type: Date, required: true },
    subscriptionStatus: { type: String, required: true, enum: ["Active", "Inactive"] },
    billingAddress: { type: String, required: true, default: "" },
    billingPostcode: { type: String, default: "" },
    paymentDetails: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const Subscription = model("Subscription", subscriptionSchema);
