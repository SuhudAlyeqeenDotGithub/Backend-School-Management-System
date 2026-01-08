import { Billing } from "../models/admin/billingModel";
import { generateCustomId, sendEmailToOwner } from "./databaseFunctions";
import {
  throwError,
  getCurrentMonth,
  getObjectSize,
  getNextBillingDate,
  isExpired,
  getLastMonth
} from "../utils/pureFuctions.ts";
import { Request } from "express";

import { getEnvVarAsNumber, getOwnerMongoId } from "./envVariableGetters";
import { Account } from "../models/admin/accountModel";
import { Feature } from "../models/admin/features";
import { getLastBillingDate } from "./pureFuctions.ts";
import { Subscription } from "../models/admin/subscription.ts";

export const addVat = (amount: number): number => {
  const ukVatPercentage = getEnvVarAsNumber("UK_VAT_PERCENTAGE");
  const vatAmount = (amount * ukVatPercentage) / 100;
  return amount + vatAmount;
};
export const getLastBillingDateBill = async (organisationId: string) => {
  const lastMonthBillingDoc = await Billing.findOne({
    organisationId,
    billingMonth: getLastBillingDate()
  });
  return lastMonthBillingDoc;
};

export const getLastBillingDateStorages = async (organisationId: string) => {
  const lastMonthBillingDoc = await Billing.findOne({
    organisationId,
    billingMonth: getLastMonth()
  });

  const lastMonthDatabaseStorage = lastMonthBillingDoc ? lastMonthBillingDoc?.databaseStorageAndBackup.value : 0;
  const lastMonthCloudStorageGBStored = lastMonthBillingDoc ? lastMonthBillingDoc?.cloudStorageGBStored.value : 0;
  return { lastMonthDatabaseStorage, lastMonthCloudStorageGBStored };
};

export const registerBillings = (req: Request, usageObjects: { field: string; value: number }[]) => {
  if (!req.billings) {
    req.billings = [];
  }
  req.billings.push(...usageObjects);
};

export const createNewMonthBilling = async (
  req: Request,
  organisationId: string,
  newBillingMonth = getCurrentMonth(),
  subscriptionType: "Premium" | "Freemium"
) => {
  const { lastMonthDatabaseStorage, lastMonthCloudStorageGBStored } = await getLastBillingDateStorages(organisationId);
  const organisationAccount = await Account.findById(organisationId, "features _id name").lean();

  if (!organisationAccount) {
    await sendEmailToOwner(
      req,
      "Failed to retrieve organisation account for features - School Management App",
      `Failed to retrieve organisation account for features for organisation ID: ${organisationId} name: ${
        organisationAccount!.name
      } for month: ${newBillingMonth}`
    );
    throwError("Failed to create current month billing document", 500);
  }

  const features = organisationAccount?.features;
  const featuresIds = features?.map((feature) => feature._id);
  const featuresObjects = await Feature.find({ _id: { $in: featuresIds } }, "name _id price");

  if (!featuresObjects) {
    await sendEmailToOwner(
      req,
      "Failed to retrieve organisation features for new billing document - School Management App",
      `Failed to retrieve features for new billing document for organisation ID: ${organisationId} for month: ${newBillingMonth}`
    );
    throwError("Failed to create current month billing document", 500);
  }

  const featuresToCharge = featuresObjects.map((feature) => ({
    _id: feature._id,
    name: feature.name,
    price: feature.price
  }));
  // const newBillingDoc = await Billing.create({
  //   organisationId,
  //   billingMonth: newBillingMonth,
  //   billingId: `${generateCustomId("BILL", true)}`,
  //   billingDate: getNextBillingDate(),
  //   subscriptionType,
  //   databaseStorageAndBackup: { value: lastMonthDatabaseStorage },
  //   cloudStorageGBStored: { value: lastMonthCloudStorageGBStored },
  //   featuresToCharge
  // });

  const newBillingDoc = await Billing.findOneAndUpdate(
    {
      organisationId,
      billingMonth: newBillingMonth,
      subscriptionType: "Premium"
    },
    {
      $setOnInsert: {
        billingId: `${generateCustomId("BILL", true)}`,
        billingDate: getNextBillingDate(),
        databaseStorageAndBackup: { value: lastMonthDatabaseStorage },
        cloudStorageGBStored: { value: lastMonthCloudStorageGBStored },
        featuresToCharge
      }
    },
    { upsert: true, new: true }
  );

  if (!newBillingDoc) {
    await sendEmailToOwner(
      req,
      "New month billing document creation failed - School Management App",
      `Failed to create new month billing document for organisation ID: ${organisationId} for month: ${newBillingMonth}`
    );
    throwError("Failed to create current month billing document", 500);
  }

  return { newBillingDoc, returnOperationCount: 5 + featuresObjects.length };
};

export const getSelfBillingDoc = async (req: Request) => {
  const newBillingMonth = getCurrentMonth();
  const ownerMongoId = getOwnerMongoId();
  let operationCount = 0;

  const existingBillingDoc = await Billing.findOne({
    organisationId: ownerMongoId,
    billingMonth: newBillingMonth,
    subscriptionType: "Premium"
  }).lean();
  operationCount++;
  if (!existingBillingDoc) {
    const { newBillingDoc, returnOperationCount } = await createNewMonthBilling(
      req,
      ownerMongoId,
      newBillingMonth,
      "Premium"
    );
    return { billingDoc: newBillingDoc, operationCount: operationCount + returnOperationCount, created: true };
  } else {
    return { billingDoc: existingBillingDoc, operationCount, created: false };
  }
};
export const selfBill = async (req: Request, billingFields: { field: string; value: any }[]) => {
  const { billingDoc, operationCount, created } = await getSelfBillingDoc(req);
  const selfBillingDoc = billingDoc as { [key: string]: any };

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
    await sendEmailToOwner(
      req,
      "Billing Update Failed - School Management App",
      "Failed to update owner billing document"
    );
  }
};
export const getBillingDoc = async (req: Request, organisationId: string, ownerBills: any[]) => {
  const newBillingMonth = getCurrentMonth();
  const subscription = await Subscription.findOne({ organisationId }).lean();

  if (!subscription) {
    sendEmailToOwner(
      req,
      "Subscription Not found during billing registration",
      `Organisation with the ID: ${organisationId} does not have a subscription`
    );
    throwError("Subscription not found", 500);
  }
  const subscriptionType = subscription?.subscriptionType;
  let operationCount = 1;

  // if on freemium and expired or on premium,  we get premium billing and if premium billing does not exist for that month we create one
  // if on freemium and not expired, we get freemium billing and if not exist, we create one

  if (subscriptionType === "Premium" || (subscriptionType === "Freemium" && isExpired(subscription!.freemiumEndDate))) {
    const existingBillingDoc = await Billing.findOne({
      organisationId: organisationId,
      billingMonth: newBillingMonth,
      subscriptionType: "Premium"
    });

    operationCount++;

    if (!existingBillingDoc) {
      const { newBillingDoc, returnOperationCount } = await createNewMonthBilling(
        req,
        organisationId,
        newBillingMonth,
        "Premium"
      );

      ownerBills.push(
        { field: "databaseOperation", value: operationCount + returnOperationCount },
        { field: "databaseStorageAndBackup", value: getObjectSize(newBillingDoc) * 2 },
        { field: "databaseDataTransfer", value: getObjectSize([existingBillingDoc, subscription, newBillingDoc]) }
      );
      return { returnBillingDoc: newBillingDoc, operationCount: operationCount + returnOperationCount, created: true };
    } else {
      ownerBills.push(
        { field: "databaseOperation", value: operationCount },
        { field: "databaseDataTransfer", value: getObjectSize([existingBillingDoc, subscription]) }
      );
      return { returnBillingDoc: existingBillingDoc, operationCount, created: false };
    }
  } else if (subscriptionType === "Freemium" && !isExpired(subscription!.freemiumEndDate)) {
    const existingBillingDoc = await Billing.findOne({
      organisationId: organisationId,
      billingMonth: newBillingMonth,
      subscriptionType: "Freemium"
    });

    operationCount++;

    if (!existingBillingDoc) {
      const { newBillingDoc, returnOperationCount } = await createNewMonthBilling(
        req,
        organisationId,
        newBillingMonth,
        "Freemium"
      );

      ownerBills.push(
        { field: "databaseOperation", value: operationCount + returnOperationCount },
        { field: "databaseStorageAndBackup", value: getObjectSize(newBillingDoc) * 2 },
        { field: "databaseDataTransfer", value: getObjectSize([existingBillingDoc, subscription, newBillingDoc]) }
      );
      return { returnBillingDoc: newBillingDoc, operationCount: operationCount + returnOperationCount, created: true };
    } else {
      ownerBills.push(
        { field: "databaseOperation", value: operationCount },
        { field: "databaseDataTransfer", value: getObjectSize([existingBillingDoc, subscription]) }
      );
      return { returnBillingDoc: existingBillingDoc, operationCount, created: false };
    }
  }
};
export const billOrganisation = async (
  req: Request,
  organisationId: string,
  billingFields: { field: string; value: any }[]
) => {
  const ownerBills: any[] = [];
  const result = await getBillingDoc(req, organisationId, ownerBills);
  if (!result) {
    throwError("Failed to get billing document", 500);
    return;
  }
  const { returnBillingDoc, operationCount, created } = result;
  const billingDoc = { ...returnBillingDoc.toObject() } as { [key: string]: any };
  const objectSize = getObjectSize(returnBillingDoc);

  // if the billing document is for the owner
  if (organisationId === getOwnerMongoId()) {
    // merger billing fields, ownerbills, and self billing objects into one
    const ownerBillingFields = [
      ...billingFields,
      ...ownerBills,
      { field: "databaseOperation", value: 2 + operationCount },
      { field: "databaseStorageAndBackup", value: created ? objectSize * 2 : 0 },
      { field: "databaseDataTransfer", value: created ? objectSize : 0 }
    ];

    // append all fields in ownerBillingFields to billingDoc
    ownerBillingFields.forEach(({ field, value: localValue }) => {
      if (billingDoc[field]) {
        billingDoc[field].value += localValue;
      }
    });

    // update billing document which will be owner bills
    const updatedBillingDoc = await Billing.findByIdAndUpdate(billingDoc._id, billingDoc, { new: true });
    if (!updatedBillingDoc) {
      await sendEmailToOwner(
        req,
        "Billing Update Failed - School Management App",
        `Failed to update organisation billing document for organisation ${organisationId} for month: ${billingDoc.billingMonth}`
      );
      throwError("Failed to update organisation billing document", 500);
    }
    // if the billing document is not for the owner
  } else {
    // append all fields in billingFields to billingDoc
    billingFields.forEach(({ field, value: localValue }) => {
      if (billingDoc[field]) {
        billingDoc[field].value += localValue;
      }
    });

    // update billing document
    const updatedBillingDoc = await Billing.findByIdAndUpdate(billingDoc._id, billingDoc, { new: true });
    if (!updatedBillingDoc) {
      await sendEmailToOwner(
        req,
        "Billing Update Failed - School Management App",
        `Failed to update organisation billing document for organisation ${organisationId} for month: ${billingDoc.billingMonth}`
      );
      throwError("Failed to update organisation billing document", 500);
    }

    // then add the operation count of billing to owners bills - self bill
    await selfBill(req, [
      ...ownerBills,
      { field: "databaseOperation", value: 2 + operationCount },
      { field: "databaseStorageAndBackup", value: created ? objectSize * 2 : 0 },
      { field: "databaseDataTransfer", value: created ? objectSize : 0 }
    ]);
  }
};
