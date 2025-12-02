import { Billing } from "../models/admin/billingModel";
import {
  generateCustomId,
  getCurrentMonth,
  getLastMonth,
  getNextMonth,
  sendEmailToOwner,
  throwError
} from "./utilsFunctions";
import { getObjectSize } from "./utilsFunctions";
import { Request } from "express";

import { getEnvVarAsNumber, getOwnerMongoId } from "./envVariableGetters";

export const addVat = (amount: number): number => {
  const ukVatPercentage = getEnvVarAsNumber("UK_VAT_PERCENTAGE");
  const vatAmount = (amount * ukVatPercentage) / 100;
  return amount + vatAmount;
};
export const getLastMonthBill = async (organisationId: string) => {
  const lastMonthBillingDoc = await Billing.findOne({
    organisationId,
    billingMonth: getLastMonth()
  });
  return lastMonthBillingDoc;
};

export const getLastMonthStorages = async (organisationId: string) => {
  const lastMonthBillingDoc = await Billing.findOne({
    organisationId,
    billingMonth: getLastMonth()
  });

  const lastMonthDatabaseStorage = lastMonthBillingDoc ? lastMonthBillingDoc?.databaseStorageAndBackup.value : 0;
  const lastMonthCloudStorageGBStored = lastMonthBillingDoc ? lastMonthBillingDoc?.cloudStorageGBStored.value : 0;
  return { lastMonthDatabaseStorage, lastMonthCloudStorageGBStored };
};

export const registerBillings = (req: Request, fields: { field: string; value: number }[]) => {
  if (!req.billings) {
    req.billings = [];
  }
  req.billings.push(...fields);
};

const createNewMonthBilling = async (organisationId: string, newBillingMonth = getCurrentMonth()) => {
  const { lastMonthDatabaseStorage, lastMonthCloudStorageGBStored } = await getLastMonthStorages(organisationId);
  const newBillingDoc = await Billing.create({
    organisationId,
    billingMonth: newBillingMonth,
    billingId: `${generateCustomId("BILL", true)}`,
    billingDate: getNextMonth(),
    databaseStorageAndBackup: { value: lastMonthDatabaseStorage },
    cloudStorageGBStored: { value: lastMonthCloudStorageGBStored }
  });

  if (!newBillingDoc) {
    await sendEmailToOwner(
      "New month billing document creation failed - School Management App",
      `Failed to create new month billing document for organisation ID: ${organisationId} for month: ${newBillingMonth}`
    );
    throwError("Failed to create current month billing document", 500);
  }

  return { newBillingDoc, returnOperationCount: 3 };
};

export const getSelfBillingDoc = async () => {
  const newBillingMonth = getCurrentMonth();
  const ownerMongoId = getOwnerMongoId();
  let operationCount = 0;

  const existingBillingDoc = await Billing.findOne({
    organisationId: ownerMongoId,
    billingMonth: newBillingMonth
  });
  operationCount++;

  if (!existingBillingDoc) {
    const { newBillingDoc, returnOperationCount } = await createNewMonthBilling(ownerMongoId, newBillingMonth);
    return { billingDoc: newBillingDoc, operationCount: operationCount + returnOperationCount, created: true };
  } else {
    return { billingDoc: existingBillingDoc, operationCount, created: false };
  }
};

export const getBillingDoc = async (organisationId: string) => {
  const newBillingMonth = getCurrentMonth();
  let operationCount = 0;

  const existingBillingDoc = await Billing.findOne({
    organisationId: organisationId,
    billingMonth: newBillingMonth,
    billingDate: getNextMonth()
  });

  operationCount++;

  if (!existingBillingDoc) {
    const { newBillingDoc, returnOperationCount } = await createNewMonthBilling(organisationId, newBillingMonth);

    const newBillObjectSize = getObjectSize(newBillingDoc);
    await selfBill([
      { field: "databaseOperation", value: operationCount + returnOperationCount },
      { field: "databaseStorageAndBackup", value: newBillObjectSize * 2 },
      { field: "databaseDataTransfer", value: newBillObjectSize }
    ]);
    return { returnBillingDoc: newBillingDoc, operationCount: operationCount + returnOperationCount, created: true };
  } else {
    await selfBill([
      { field: "databaseOperation", value: operationCount },
      { field: "databaseDataTransfer", value: getObjectSize(existingBillingDoc) }
    ]);
    return { returnBillingDoc: existingBillingDoc, operationCount, created: false };
  }
};

export const selfBill = async (billingFields: { field: string; value: any }[]) => {
  const { billingDoc, operationCount, created } = await getSelfBillingDoc();
  const selfBillingDoc = { ...billingDoc.toObject() } as { [key: string]: any };

  billingFields.forEach(({ field, value: localValue }) => {
    if (selfBillingDoc[field]) {
      selfBillingDoc[field].value += localValue;
    }
  });

  // register self
  selfBillingDoc.databaseOperation.value += operationCount + 2;

  if (created) {
    const objectSize = getObjectSize(selfBillingDoc);
    selfBillingDoc.databaseStorageAndBackup.value += objectSize * 2;
    selfBillingDoc.databaseDataTransfer.value += objectSize;
  }

  const updatedSelfBill = await Billing.findByIdAndUpdate(selfBillingDoc._id, selfBillingDoc, { new: true });

  if (!updatedSelfBill) {
    await sendEmailToOwner("Billing Update Failed - School Management App", "Failed to update owner billing document");
  }
};

export const billOrganisation = async (organisationId: string, billingFields: { field: string; value: any }[]) => {
  const { returnBillingDoc, operationCount, created } = await getBillingDoc(organisationId);
  const billingDoc = { ...returnBillingDoc.toObject() } as { [key: string]: any };

  billingFields.forEach(({ field, value: localValue }) => {
    if (billingDoc[field]) {
      billingDoc[field].value += localValue;
    }
  });

  const objectSize = getObjectSize(returnBillingDoc);

  const updatedBillingDoc = await Billing.findByIdAndUpdate(billingDoc._id, billingDoc, { new: true });
  if (!updatedBillingDoc) {
    await sendEmailToOwner(
      "Billing Update Failed - School Management App",
      `Failed to update organisation billing document for organisation ${organisationId} for month: ${billingDoc.billingMonth}`
    );
    throwError("Failed to update organisation billing document", 500);
  }

  await selfBill([
    { field: "databaseOperation", value: 2 + operationCount },
    { field: "databaseStorageAndBackup", value: created ? objectSize * 2 : 0 },
    { field: "databaseDataTransfer", value: created ? objectSize : 0 }
  ]);
};
