import dotenv from "dotenv";
dotenv.config();

// Utility function to safely get env variables
function getEnvVar(key: string): string {
  const value = process.env[key];
  return value as string;
}

function getEnvVarAsNumber(key: string): number {
  const value = getEnvVar(key);
  const num = Number(value);
  return num;
}

// ------------------
// Owner
// ------------------
export const getOwnerMongoId = () => getEnvVar("OWNER_MONGO_ID");

// ------------------
// Rates
// ------------------
export const getAppProvisionCost = () => getEnvVarAsNumber("APP_PROVISION_COST");

// ------------------
// Database
// ------------------
export const getDatabaseTotalCost = () => getEnvVarAsNumber("DATABASE_TOTAL_COST");
export const getDatabaseOperationsPercentage = () => getEnvVarAsNumber("DATABASE_OPERATIONS_PERCENTAGE");
export const getDatabaseDataTransferPercentage = () => getEnvVarAsNumber("DATABASE_DATA_TRANSFER_PERCENTAGE");
export const getDatabaseDataStorageAndBackupPercentage = () =>
  getEnvVarAsNumber("DATABASE_DATA_STORAGE_AND_BACKUP_PERCENTAGE");

// ------------------
// Cloud Storage
// ------------------
export const getCloudStorageGbStoredRate = () => getEnvVarAsNumber("CLOUD_STORAGE_GB_STORED_RATE");
export const getCloudStorageGbDownloadedRate = () => getEnvVarAsNumber("CLOUD_STORAGE_GB_DOWNLOADED_RATE");
export const getCloudStorageUploadOperationRate = () => getEnvVarAsNumber("CLOUD_STORAGE_UPLOAD_OPERATION_RATE");
export const getCloudStorageDownloadOperationRate = () => getEnvVarAsNumber("CLOUD_STORAGE_DOWNLOAD_OPERATION_RATE");

// ------------------
// Backend Server
// ------------------
export const getRenderComputeCost = () => getEnvVarAsNumber("RENDER_COMPUTE_COST");
export const getRenderBaseCost = () => getEnvVarAsNumber("RENDER_BASE_COST");
export const getRenderBandwidthRate = () => getEnvVarAsNumber("RENDER_BANDWIDTH_RATE");

// ------------------
// Frontend Server
// ------------------
export const getFrontendBaseCost = () => getEnvVarAsNumber("FRONTEND_BASE_COST");

// ------------------
// Currency Rates
// ------------------
export const getDollarNairaRate = () => getEnvVarAsNumber("DOLLAR_NAIRA");
export const getDollarPoundsRate = () => getEnvVarAsNumber("DOLLAR_POUNDS");
