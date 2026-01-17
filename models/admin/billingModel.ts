import mongoose, { Schema, model } from "mongoose";

import { generateCustomId } from "../../utils/databaseFunctions";
import { generateSearchText, getCurrentMonth, getNextBillingDate } from "../../utils/pureFuctions.ts";
import { subscribe } from "diagnostics_channel";

export const valueCostType = new mongoose.Schema(
  {
    value: { type: Number, default: 0 },
    costInDollar: { type: Number, default: 0 }
  },
  { _id: false }
);

const billingSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Account" },
    billingId: {
      type: String,
      required: true
    },
    subscriptionType: { type: String, required: true, enum: ["Premium", "Freemium"], default: "Premium" },
    billingMonth: {
      type: String,
      required: true,
      default: () => getCurrentMonth()
    },
    billingDate: {
      type: String,
      required: true,
      default: () => getNextBillingDate()
    },
    dollarToNairaRate: {
      type: Number,
      default: 0
    },
    dollarToPoundsRate: {
      type: Number,
      default: 0
    },
    billingStatus: { type: String, required: true, enum: ["Billed", "Not Billed"], default: "Not Billed" },
    paymentStatus: { type: String, required: true, enum: ["Paid", "Unpaid", "Pending", "Failed"], default: "Unpaid" },
    totalCost: {
      type: Number,
      required: true,
      default: 0
    },
    featuresToCharge: {
      type: [{ _id: String, name: String, price: Number }],
      required: true,
      default: []
    },

    // render
    renderBaseCost: {
      type: Number,
      required: true,
      default: 0
    },
    renderBandwidth: {
      type: valueCostType,
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        costInDollar: 0
      })
    },
    renderComputeSeconds: {
      type: valueCostType,
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        costInDollar: 0
      })
    },

    // database
    databaseStorageAndBackup: {
      type: valueCostType,
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        costInDollar: 0
      })
    },
    databaseOperation: {
      type: valueCostType,
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        costInDollar: 0
      })
    },
    databaseDataTransfer: {
      type: valueCostType,
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        costInDollar: 0
      })
    },

    // cloud
    cloudStorageGBStored: {
      type: valueCostType,
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        costInDollar: 0
      })
    },
    cloudStorageGBDownloaded: {
      type: valueCostType,
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        costInDollar: 0
      })
    },
    cloudStorageUploadOperation: {
      type: valueCostType,
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        costInDollar: 0
      })
    },
    cloudStorageDownloadOperation: {
      type: valueCostType,
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        costInDollar: 0
      })
    },
    transferedFreemiumToOwner: Boolean,
    searchText: {
      type: String,
      required: true,
      default: "search"
    }
  },
  { timestamps: true }
);

billingSchema.index({ organisationId: 1, billingMonth: 1, subscriptionType: 1 }, { unique: true });
billingSchema.index({ organisationId: 1, billingMonth: 1, subscriptionType: 1, billingStatus: 1 });
billingSchema.index({ billingMonth: 1, subscriptionType: 1, billingStatus: 1 });
billingSchema.index({ subscriptionType: 1, paymentStatus: 1, billingStatus: 1 });
billingSchema.index({ organisationId: 1, billingId: 1 }, { unique: true });

billingSchema.pre("save", function (next) {
  if (!this.billingId) {
    this.billingId = `${generateCustomId("BILL", true)}}`;
  }
  if (!this.searchText || this.searchText === "search") {
    this.searchText = generateSearchText([this.billingMonth, this.billingId]);
  }
  next();
});

export const Billing = model("Billing", billingSchema);
