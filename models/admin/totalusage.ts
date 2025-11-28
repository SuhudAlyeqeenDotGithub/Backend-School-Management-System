import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const totalUsageSchema = new Schema(
  {
    billingMonth: {
      type: String,
      required: true
    },
    billingDate: {
      type: String,
      required: true
    },
    renderBandwidth: {
      type: Number,
      _id: false,
      required: true,
      default: 0
    },
    renderComputeSeconds: {
      type: Number,
      _id: false,
      required: true,
      default: 0
    },

    // database
    databaseStorageAndBackup: {
      type: Number,
      _id: false,
      required: true,
      default: 0
    },
    databaseOperation: {
      type: Number,
      _id: false,
      required: true,
      default: 0
    },
    databaseDataTransfer: {
      type: Number,
      _id: false,
      required: true,
      default: 0
    },

    // cloud
    cloudStorageGBStored: {
      type: Number,
      _id: false,
      required: true,
      default: 0
    },
    cloudStorageGBDownloaded: {
      type: Number,
      _id: false,
      required: true,
      default: 0
    },
    cloudStorageUploadOperation: {
      type: Number,
      _id: false,
      required: true,
      default: 0
    },
    cloudStorageDownloadOperation: {
      type: Number,
      _id: false,
      required: true,
      default: 0
    }
  },
  { timestamps: true }
);

export const TotalUsage = model("TotalUsage", totalUsageSchema);
