import mongoose from "mongoose";
const { Schema, model } = mongoose;
import { nanoid } from "nanoid";
import dotenv from "dotenv";
dotenv.config();

const aggregateBillingSchema = new Schema(
  {
    billingMonth: {
      type: String,
      required: true,
      default: () => new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })
    },
    mongoBaseCost: {
      type: Number,
      required: true,
      default: () => parseFloat(process.env.MONGO_BASE_COST as string) || 0
    },
    databaseOperation: {
      type: {
        value: Number,
        ratePerUnit: Number,
        costInDollar: Number
      },
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        ratePerUnit: parseFloat(process.env.DATABASE_READ as string) || 0,
        costInDollar: 0
      })
    },
    databaseStorage: {
      type: {
        value: Number,
        ratePerUnit: Number,
        costInDollar: Number
      },
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        ratePerUnit: parseFloat(process.env.DATABASE_STORAGE as string) || 0,
        costInDollar: 0
      })
    },
    databaseBackup: {
      type: {
        value: Number,
        ratePerUnit: Number,
        costInDollar: Number
      },
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        ratePerUnit: parseFloat(process.env.DATABASE_BACKUP as string) || 0,
        costInDollar: 0
      })
    },
    dataBaseDataTransfer: {
      type: {
        value: Number,
        ratePerUnit: Number,
        costInDollar: Number
      },
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        ratePerUnit: parseFloat(process.env.DATABASE_DATA_TRANSFER as string) || 0,
        costInDollar: 0
      })
    },
    cloudFunctionInvocation: {
      type: {
        value: Number,
        ratePerUnit: Number,
        costInDollar: Number
      },
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        ratePerUnit: parseFloat(process.env.CLOUD_FUNCTION_INVOCATION as string) || 0,
        costInDollar: 0
      })
    },
    cloudFunctionGBSeconds: {
      type: {
        value: Number,
        ratePerUnit: Number,
        costInDollar: Number
      },
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        ratePerUnit: parseFloat(process.env.CLOUD_FUNCTION_GB_SECONDS as string) || 0,
        costInDollar: 0
      })
    },
    cloudFunctionCPUSeconds: {
      type: {
        value: Number,
        ratePerUnit: Number,
        costInDollar: Number
      },
      _id: false,
      required: true,
      default: () => ({
        value: 0,
        ratePerUnit: parseFloat(process.env.CLOUD_FUNCTION_CPU_SECONDS as string) || 0,
        costInDollar: 0
      })
    },
    totalCost: {
      type: { costInDollar: Number, costInNaira: Number, costInPound: Number },
      _id: false,
      required: true,
      default: {
        costInDollar: 0,
        costInNaira: 0,
        costInPound: 0
      }
    }
  },
  { timestamps: true }
);

export const AggregateBilling = model("AggregateBilling", aggregateBillingSchema);
