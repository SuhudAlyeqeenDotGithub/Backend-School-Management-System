import dotenv from "dotenv";
import { addVat } from "./billingFunctions";
dotenv.config();

// Utility function to safely get env variables
export function getEnvVar(key: string): string {
  const value = process.env[key];
  return value as string;
}

export function getEnvVarAsNumber(key: string): number {
  const value = getEnvVar(key);
  const num = Number(value);
  return num;
}

// ------------------
// Owner
// ------------------
export const getOwnerMongoId = () => getEnvVar("OWNER_MONGO_ID");

export const getPaystackSecretKey = () => getEnvVar("PAYSTACK_SECRET_KEY");

// ------------------
// Rates
// ------------------
export const getAppProvisionRate = () => getEnvVarAsNumber("APP_PROVISION_RATE");

// ------------------
// Database
// ------------------

export const getDatabaseOperationsRate = () =>
  addVat(getEnvVarAsNumber("DATABASE_OPERATIONS_PERCENTAGE") / 100) * getEnvVarAsNumber("DATABASE_TOTAL_RATE");
export const getDatabaseDataTransferRate = () =>
  addVat(getEnvVarAsNumber("DATABASE_DATA_TRANSFER_PERCENTAGE") / 100) * getEnvVarAsNumber("DATABASE_TOTAL_RATE");
export const getDatabaseDataStorageAndBackupRate = () =>
  addVat(getEnvVarAsNumber("DATABASE_DATA_STORAGE_AND_BACKUP_PERCENTAGE") / 100) *
  getEnvVarAsNumber("DATABASE_TOTAL_RATE");
// ------------------
// Cloud Storage
// ------------------
export const getCloudStorageGbStoredRate = () => addVat(getEnvVarAsNumber("CLOUD_STORAGE_GB_STORED_RATE"));
export const getCloudStorageGbDownloadedRate = () => addVat(getEnvVarAsNumber("CLOUD_STORAGE_GB_DOWNLOADED_RATE"));
export const getCloudStorageUploadOperationRate = () =>
  addVat(getEnvVarAsNumber("CLOUD_STORAGE_UPLOAD_OPERATION_RATE"));
export const getCloudStorageDownloadOperationRate = () =>
  addVat(getEnvVarAsNumber("CLOUD_STORAGE_DOWNLOAD_OPERATION_RATE"));

// ------------------
// Backend Server
// ------------------
export const getRenderComputeRate = () => addVat(getEnvVarAsNumber("RENDER_COMPUTE_RATE"));
export const getRenderBaseRate = () => addVat(getEnvVarAsNumber("RENDER_BASE_RATE"));
export const getRenderBandwidthRate = () => addVat(getEnvVarAsNumber("RENDER_BANDWIDTH_RATE"));

// ------------------
// Frontend Server
// ------------------
export const getFrontendBaseRate = () => addVat(getEnvVarAsNumber("FRONTEND_BASE_RATE"));

// ------------------
// Currency Rates
// ------------------
export const getDollarNairaRate = () => getEnvVarAsNumber("DOLLAR_NAIRA");
export const getDollarPoundsRate = () => getEnvVarAsNumber("DOLLAR_POUNDS");
