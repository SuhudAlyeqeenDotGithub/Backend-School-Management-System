import { Billing } from "../models/admin/billingModel";
import { getCurrentMonth, getLastMonth, getOwnerMongoId, throwError } from "./utilsFunctions";
import { getObjectSize } from "./utilsFunctions";
import { AggregateBilling } from "../models/admin/aggregateBilling";

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

const createNewMonthBilling = async (organisationId: string, newBillingMonth = getCurrentMonth()) => {
  const { lastMonthDatabaseStorage, lastMonthCloudStorageGBStored } = await getLastMonthStorages(organisationId);
  const newBillingDoc = await Billing.create({
    organisationId,
    billingMonth: newBillingMonth,
    databaseStorageAndBackup: { value: lastMonthDatabaseStorage },
    cloudStorageGBStored: { value: lastMonthCloudStorageGBStored }
  });

  if (!newBillingDoc) {
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
    newBillingMonth
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
  const billingMonth = getCurrentMonth();
  let operationCount = 0;

  const existingBillingDoc = await Billing.findOne({
    organisationId: organisationId,
    billingMonth
  });

  operationCount++;

  if (!existingBillingDoc) {
    const { newBillingDoc, returnOperationCount } = await createNewMonthBilling(organisationId, billingMonth);

    const objectSize = getObjectSize(newBillingDoc);
    await selfBill([
      { field: "databaseOperation", value: operationCount + returnOperationCount },
      { field: "databaseStorageAndBackup", value: objectSize * 2 }
    ]);
    return { returnBillingDoc: newBillingDoc, operationCount: operationCount + returnOperationCount, created: true };
  } else {
    await selfBill([{ field: "databaseOperation", value: operationCount }]);
    return { returnBillingDoc: existingBillingDoc, operationCount, created: false };
  }
};

export const selfBill = async (billingFields: { field: string; value: any }[]) => {
  const { billingDoc, operationCount, created } = await getSelfBillingDoc();
  const selfBillingDoc = { ...billingDoc.toObject() } as { [key: string]: any };

  billingFields.forEach(({ field, value: localValue }) => {
    if (selfBillingDoc[field]) {
      selfBillingDoc[field].value += localValue;
      selfBillingDoc[field].costInDollar = selfBillingDoc[field].value * selfBillingDoc[field].ratePerUnit;
    }
  });

  // register self
  selfBillingDoc.databaseOperation.value += operationCount + 2;

  if (created) {
    const objectSize = getObjectSize(selfBillingDoc);
    selfBillingDoc.databaseStorageAndBackup.value += objectSize * 2;
  }

  const updatedSelfBill = await Billing.findByIdAndUpdate(selfBillingDoc._id, selfBillingDoc, { new: true });
  if (!updatedSelfBill) {
    throwError("Failed to update owner billing document", 500);
  }
};

export const billOrganisation = async (organisationId: string, billingFields: { field: string; value: any }[]) => {
  const { returnBillingDoc, operationCount, created } = await getBillingDoc(organisationId);
  const billingDoc = { ...returnBillingDoc.toObject() } as { [key: string]: any };

  billingFields.forEach(({ field, value: localValue }) => {
    if (billingDoc[field]) {
      billingDoc[field].value += localValue;
      billingDoc[field].costInDollar = billingDoc[field].value * billingDoc[field].ratePerUnit;
    }
  });

  const objectSize = getObjectSize(returnBillingDoc);
  // console.log("self billing for billing organisation with", { field: "databaseOperation", value: 2 + operationCount });
  await selfBill([
    { field: "databaseOperation", value: 2 + operationCount },
    { field: "databaseStorageAndBackup", value: created ? objectSize * 2 : 0 }
  ]);

  const updatedBillingDoc = await Billing.findByIdAndUpdate(billingDoc._id, billingDoc, { new: true });
  if (!updatedBillingDoc) {
    throwError("Failed to update organisation billing document", 500);
  }
};
