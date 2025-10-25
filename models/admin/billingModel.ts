import mongoose from "mongoose";
const { Schema, model } = mongoose;
import { nanoid } from "nanoid";
import { getAppProvisionCost, getRenderBaseCost } from "../../utils/envVariableGetters";

import { generateSearchText, getCurrentMonth } from "../../utils/utilsFunctions";

const valueCostType = new mongoose.Schema(
  {
    value: { type: Number, default: 0 },
    costInDollar: { type: Number, default: 0 }
  },
  { _id: false }
);

const billingSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    billingId: String,
    billingMonth: {
      type: String,
      required: true,
      default: () => getCurrentMonth()
    },
    billingStatus: { type: String, required: true, enum: ["Billed", "Not Billed"], default: "Not Billed" },
    paymentStatus: { type: String, required: true, enum: ["paid", "unpaid", "pending", "Failed"], default: "unpaid" },
    totalCost: {
      type: {
        costInDollar: Number,
        costInNaira: Number,
        costInPounds: Number
      },
      _id: false,
      required: true,
      default: () => ({
        costInDollar: 0,
        costInNaira: 0,
        costInPounds: 0
      })
    },
    appProvisionCost: {
      type: Number,
      required: true,
      default: () => getAppProvisionCost()
    },
    renderBaseCost: {
      type: Number,
      required: true,
      default: () => getRenderBaseCost()
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
    searchText: {
      type: String,
      required: true,
      default: "search"
    }
  },
  { timestamps: true }
);

billingSchema.index({ organisationId: 1, billingMonth: 1 }, { unique: true });
billingSchema.index({ paymentStatus: 1, organisationId: 1 });
billingSchema.index({ billingStatus: 1, organisationId: 1 });

billingSchema.pre("save", function (next) {
  if (!this.billingId) {
    this.billingId = `Bill-${nanoid()}`;
  }
  if (!this.searchText || this.searchText === "search") {
    this.searchText = generateSearchText([this.billingMonth, this.billingId]);
  }
  next();
});

export const Billing = model("Billing", billingSchema);
