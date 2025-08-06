import mongoose from "mongoose";
const { Schema, model } = mongoose;
import { nanoid } from "nanoid";

const billingSchema = new Schema({
  organisationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  billingId: String,
  billingMonth: { type: String, required: true },
  paymentStatus: { type: String, required: true, enum: ["paid", "unpaid", "pending"], default: "unpaid" },
  mongoBaseCost: { type: Number, required: true, default: 0 },
  appProvisionCost: { type: Number, required: true, default: 0 },
  databaseRead: {
    type: { count: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { count: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  databaseWrite: {
    type: { count: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { count: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  databaseDelete: {
    type: { count: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { count: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  databaseUpdate: {
    type: { count: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { count: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  databaseStorage: {
    type: { gbValue: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { gbValue: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  databaseBackup: {
    type: { gbValue: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { gbValue: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  dataBaseDataTransfer: {
    type: { gbValue: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { gbValue: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  cloudStorageGBStored: {
    type: { gbValue: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { gbValue: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  cloudStorageGBDownloaded: {
    type: { gbValue: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { gbValue: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  cloudStorageUploadOperation: {
    type: { count: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { count: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  cloudStorageDownloadOperation: {
    type: { count: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { count: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  cloudFunctionGBSeconds: {
    type: { gbValue: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { gbValue: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  cloudFunctionCPUSeconds: {
    type: { gbValue: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { gbValue: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  cloudFunctionOutboundNetworking: {
    type: { gbValue: Number, perUnitRate: Number, costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { gbValue: 0, perUnitRate: 0, costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },
  totalCost: {
    type: { costInNaira: Number, costInDollar: Number, costInPound: Number },
    required: true,
    default: { costInNaira: 0, costInDollar: 0, costInPound: 0 }
  },

  searchText: { type: String, required: true }
});

billingSchema.pre("save", function (next) {
  if (!this.billingId) {
    this.billingId = `Bill-${nanoid()}`;
  }
  next();
});

export const Billing = model("Billing", billingSchema);
