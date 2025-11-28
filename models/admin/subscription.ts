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
    billingAddress: {
      type: String,
      required: true,
      default: {
        state: "Organisation State",
        city: "Organisation City",
        street: "Organisation Address",
        postCode: "Organisation PostCode"
      }
    },
    paymentDetails: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

subscriptionSchema.index({ organisationId: 1 });

export const Subscription = model("Subscription", subscriptionSchema);

const transactionSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    reference: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true }
);

export const Transaction = model("Transaction", transactionSchema);
