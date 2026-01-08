import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import axios from "axios";
import {
  checkOrgAndUserActiveness,
  checkAccess,
  confirmUserOrgRole,
  fetchBillings,
  sendEmailToOwner,
  generateCustomId,
  sendEmail
} from "../../utils/databaseFunctions.ts";
import {
  throwError,
  getObjectSize,
  getCurrentMonth,
  getNextBillingDate,
  getLastMonth
} from "../../utils/pureFuctions.ts";
import { Subscription } from "../../models/admin/subscription.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { Billing } from "../../models/admin/billingModel.ts";
import {
  getDatabaseDataStorageAndBackupRate,
  getDatabaseDataTransferRate,
  getDatabaseOperationsRate,
  getOwnerMongoId,
  getRenderBandwidthRate,
  getRenderComputeRate,
  getCloudStorageGbDownloadedRate,
  getCloudStorageGbStoredRate,
  getCloudStorageDownloadOperationRate,
  getCloudStorageUploadOperationRate,
  getRenderBaseRate,
  getPaystackSecretKey
} from "../../utils/envVariableGetters.ts";
import { Account } from "../../models/admin/accountModel.ts";
import { TotalUsage } from "../../models/admin/totalusage.ts";
import crypto from "crypto";

export const getBillings = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { search = "", limit, cursorType, nextCursor, prevCursor, from, to, ...filters } = req.query;

  const parsedLimit = parseInt(limit as string);

  const query: any = {};

  if (search) {
    query.searchText = { $regex: search, $options: "i" };
  }

  if (from && to) {
    const fromDate = new Date(from as string);
    const toDate = new Date(to as string);

    toDate.setDate(toDate.getDate() + 1);

    query.createdAt = {
      $gte: fromDate,
      $lt: toDate
    };
  }

  for (const key in filters) {
    if (filters[key] !== "all") {
      if (key === "organisationId") {
        const parsedOrganisationId = req.query.organisationId as string;
        const orgUID = parsedOrganisationId.split("|")[1].trim();
        query[key] = orgUID;
      } else {
        query[key] = filters[key];
      }
    }
  }

  if (cursorType) {
    if (nextCursor && cursorType === "next") {
      query._id = { $lt: nextCursor };
    } else if (prevCursor && cursorType === "prev") {
      query._id = { $gt: prevCursor };
    }
  }
  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "View Billings");
  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account])
      }
    ]);
    throwError("Unauthorised Action: You do not have access to view billings - Please contact your admin", 403);
  }
  const result = await fetchBillings(query, cursorType as string, parsedLimit, organisation!._id.toString(), accountId);

  if (!result || !result.billings) {
    throwError("Error fetching billings", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.billings.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);

  res.status(201).json(result);
});

export const getSubscription = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "View Subscriptions");

  if (absoluteAdmin || hasAccess) {
    const subscription = await Subscription.findOne({ organisationId: userTokenOrgId });
    if (!subscription) {
      throwError("Error fetching subscription", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([subscription, organisation, role, account])
      }
    ]);
    res.status(201).json(subscription);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view billings - Please contact your admin", 403);
});

export const upgradeToPremium = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "Update Subscriptions");

  if (absoluteAdmin || hasAccess) {
    const subscription = await Subscription.findOneAndUpdate(
      { organisationId: userTokenOrgId },
      {
        $set: {
          subscriptionType: "Premium",
          premiumStartDate: new Date(),
          premiumEndDate: null,
          subscriptionStatus: "Active"
        }
      },
      { new: true }
    );
    if (!subscription) {
      await sendEmailToOwner(
        req,
        "Premium Subscription Upgrade Failed",
        `Organisation with the ID: ${userTokenOrgId} tried to upgrade to premium but failed`
      );
      throwError("Error fetching subscription - we are working on it", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([subscription, organisation, role, account])
      }
    ]);

    await sendEmailToOwner(
      req,
      "Premium Subscription Upgrade",
      `Organisation with the ID: ${userTokenOrgId} and name ${account!.name} upgraded to premium successfully`
    );
    sendEmail(
      req,
      account!.email,
      "Premium Subscription Upgrade",
      `You have successfully upgraded to premium with SuSchool`,
      `<p>Hi ${account!.name}</p>
      <p> Thank you for upgrading to a premium subscription with SuSchool We are glad to have you</p>
      <p>Your bill for this month will be charged on the 5th of the next month. For the meantime you can track your usage in Billing section of your admin dashboard </p>
      <p>You can refer to the documentation if you need any help using the app</p>
      <p>If you have any question or encouter some issue, 
      please contact us at <a href="mailto:suhudalyeqeenapp@gmail.com">suhudalyeqeenapp@gmail.com</a> or <a href="mailto:alyekeeniy@gmail.com">alyekeeniy@gmail.com</a>
            </p>`
    );
    res.status(201).json(subscription);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view billings - Please contact your admin", 403);
});

export const cancelSubscription = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "Update Subscriptions");

  if (absoluteAdmin || hasAccess) {
    const subscription = await Subscription.findOneAndUpdate(
      { organisationId: userTokenOrgId },
      {
        $set: {
          subscriptionType: "Premium",
          premiumEndDate: new Date(),
          subscriptionStatus: "Inactive"
        }
      },
      { new: true }
    );
    if (!subscription) {
      await sendEmailToOwner(
        req,
        "Premium Subscription Cancellation Failed",
        `Organisation with the ID: ${userTokenOrgId} tried to cancel premium subscription but failed`
      );
      throwError("Error cancelling subscription - we are working on it", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([subscription, organisation, role, account])
      }
    ]);

    await sendEmailToOwner(
      req,
      "Premium Subscription Cancellation",
      `Organisation with the ID: ${userTokenOrgId} and name ${
        account!.name
      } cancelled premium subscription successfully`
    );
    sendEmail(
      req,
      account!.email,
      "Premium Subscription Cancellation with SuSchool",
      `You have successfully cancelled your premium subscription with SuSchool - Sorry to see you go`,
      `<p>Hi ${account!.name}</p>
     <p>You have successfully cancelled your premium subscription with SuSchool - Sorry to see you go</p>
     <p>Please note that you will still be charged the regular cost for usages before the cancellation date. This will be on the 5th of next month</p>
      <p>If you have any question or encouter some issue, 
      please contact us at <a href="mailto:suhudalyeqeenapp@gmail.com">suhudalyeqeenapp@gmail.com</a> or <a href="mailto:alyekeeniy@gmail.com">alyekeeniy@gmail.com</a>
            </p>`
    );
    res.status(201).json("You have successfully cancelled your premium subscription with SuSchool");
    return;
  }

  throwError("Unauthorised Action: You do not have access to view billings - Please contact your admin", 403);
});

export const getOrganisations = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  if (accountId !== getOwnerMongoId()) {
    return;
  }

  const organisations = await Account.find({ accountType: { $in: ["Organization", "Owner"] } }, "_id name");

  if (!organisations) {
    throwError("Error fetching organisations", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + organisations.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize(organisations)
    }
  ]);
  res.status(201).json(organisations);
  return;
});

export const getOrganisation = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.userToken;

  // find the account by email
  const account = await Account.findOne(
    { organisationId },
    "organisationId name email phone organisationInitial accountType"
  );

  if (!account) {
    throwError("Error fetching account data", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 4 },
    {
      field: "databaseDataTransfer",
      value: getObjectSize(account)
    }
  ]);

  res.status(200).json(account);
});

export const transferedLastFreemiumBillToOwnerBills = async (req: Request, accountId: string) => {
  // confirm the user is the owner
  if (accountId !== getOwnerMongoId()) {
    await sendEmailToOwner(
      req,
      "Unauthorized Prepare Last Bills Attempt - SuSchool  Management App",
      `An unauthorized attempt to prepare old bills was made by account ID: ${accountId}.`
    );
    throwError("Unauthorized Action: Only owner account can perform this action", 403);
  }
  const billingMonth = getLastMonth();

  const ownerLastBill = await Billing.findOne({
    organisationId: getOwnerMongoId(),
    billingMonth,
    subscriptionType: "Premium",
    billingStatus: "Not Billed"
  }).lean();

  if (!ownerLastBill) {
    await sendEmailToOwner(
      req,
      "Bills Transfer - Unable to get owner last bill - SuSchool Management App",
      `Unable to get owner last bill during the transfer to owner bills operation.. ${billingMonth}`
    );
    throwError("Unable to get owner last bill", 500);
    return false;
  }

  if (ownerLastBill?.transferedFreemiumToOwner) {
    return true;
  }

  const freemiumBills = await Billing.find({
    billingMonth,
    subscriptionType: "Freemium",
    billingStatus: "Not Billed"
  }).lean();

  // check if there are billing documents to process
  if (!freemiumBills || freemiumBills.length === 0) {
    await sendEmailToOwner(
      req,
      "Bills Transfer - No unbilled freemium billing documents found - SuSchool Management App",
      `No unbilled freemium billing documents were found during the transfer to owner bills operation. ${billingMonth}`
    );
    return true;
  }

  const targetUsages: any = {
    renderBaseCost: () => getRenderBaseRate(),
    renderComputeSeconds: () => getRenderComputeRate(),
    renderBandwidth: () => getRenderBandwidthRate(),
    databaseOperation: () => getDatabaseOperationsRate(),
    databaseDataTransfer: () => getDatabaseDataTransferRate(),
    cloudStorageGBDownloaded: () => getCloudStorageGbDownloadedRate(),
    cloudStorageUploadOperation: () => getCloudStorageUploadOperationRate(),
    cloudStorageDownloadOperation: () => getCloudStorageDownloadOperationRate()
  };

  let totalUsages: any = {};

  // add all usages for the month
  for (const freemiumBill of freemiumBills) {
    for (const field of Object.keys(freemiumBill)) {
      if (field in targetUsages) {
        if (field === "renderBaseCost") {
          totalUsages[field] = (totalUsages[field] || 0) + (freemiumBill as any)[field];
        } else {
          totalUsages[field] = (totalUsages[field] || 0) + (freemiumBill as any)[field].value;
        }
      }
    }
  }

  const newOwnerBill = ownerLastBill as any;
  for (const usage in totalUsages) {
    if (usage === "renderBaseCost") {
      newOwnerBill.renderBaseCost = Number(totalUsages[usage]);
    } else {
      newOwnerBill[usage] = { ...newOwnerBill[usage], value: Number(totalUsages[usage]) };
    }
  }

  newOwnerBill.transferedFreemiumToOwner = true;

  const updatedOwnerBill = await Billing.findByIdAndUpdate(newOwnerBill._id, newOwnerBill, { new: true }).lean();

  if (!updatedOwnerBill) {
    await sendEmailToOwner(
      req,
      "Bills Transfer - Unable to update owner last bill - SuSchool Management App",
      `Unable to update owner last bill after the transfer to owner bills.. ${billingMonth}`
    );
    throwError("Unable to update owner last bill", 500);
    return false;
  }

  const updatedFreemiumBills = await Billing.updateMany(
    {
      billingStatus: "Not Billed",
      subscriptionType: "Freemium",
      billingMonth
    },
    { billingStatus: "Billed" }
  ).lean();

  return true;
};
export const targetUsages: any = {
  renderBaseCost: () => getRenderBaseRate(),
  renderComputeSeconds: () => getRenderComputeRate(),
  renderBandwidth: () => getRenderBandwidthRate(),
  databaseOperation: () => getDatabaseOperationsRate(),
  databaseDataTransfer: () => getDatabaseDataTransferRate(),
  databaseStorageAndBackup: () => getDatabaseDataStorageAndBackupRate(),
  cloudStorageGBStored: () => getCloudStorageGbStoredRate(),
  cloudStorageGBDownloaded: () => getCloudStorageGbDownloadedRate(),
  cloudStorageUploadOperation: () => getCloudStorageUploadOperationRate(),
  cloudStorageDownloadOperation: () => getCloudStorageDownloadOperationRate()
};
export const prepareLastBills = async (req: Request, accountId: string) => {
  // confirm the user is the owner
  if (accountId !== getOwnerMongoId()) {
    await sendEmailToOwner(
      req,
      "Unauthorized Prepare Last Bills Attempt - SuSchool  Management App",
      `An unauthorized attempt to prepare old bills was made by account ID: ${accountId}.`
    );
    throwError("Unauthorized Action: Only owner account can perform this action", 403);
  }

  const billTransfered = await transferedLastFreemiumBillToOwnerBills(req, accountId);

  if (!billTransfered) {
    await sendEmailToOwner(
      req,
      "Prepare Bills - Unable to transfer freemium to owner bills - SuSchool Management App",
      `Unable to transfer freemium to owner bills during the prepare bills operation.`
    );
    throwError("Unable to transfer freemium to owner bills", 500);
  }

  const billingMonth = getLastMonth();
  const billingDocs = await Billing.find({
    billingMonth: billingMonth,
    subscriptionType: "Premium",
    billingStatus: "Not Billed"
  }).lean();

  // check if there are billing documents to process
  if (!billingDocs || billingDocs.length === 0) {
    await sendEmailToOwner(
      req,
      "Prepare Bills - No unbilled billing documents found - SuSchool Management App",
      `No unbilled billing documents were found during the prepare bills operation. ${billingMonth}`
    );

    return [];
  }

  let updatedBillingDocs: any[] = [];

  const targetUsageRates: any = {};
  for (const usage in targetUsages) {
    targetUsageRates[usage] = targetUsages[usage]();
  }

  let totalUsages: any = {};

  // add all usages for the month
  for (const billingDoc of billingDocs) {
    for (const field of Object.keys(billingDoc)) {
      if (field in targetUsages) {
        totalUsages[field] = (totalUsages[field] || 0) + (billingDoc as any)[field].value;
      }
    }
  }

  const totalUsageDoc = await TotalUsage.create({ ...totalUsages, billingMonth, billingDate: getNextBillingDate() });
  if (!totalUsageDoc) {
    await sendEmailToOwner(
      req,
      "Prepare Last Bills - Failed to create total usage document - SuSchool Management App",
      `Failed to create total usage document for billing month: ${billingMonth}.`
    );

    throwError("Failed to create total usage document", 500);
  }

  // calculate cost for total usages for each service

  // check if the number of total usages and cost calculations are the same
  if (Object.keys(totalUsages).length !== Object.keys(targetUsageRates).length) {
    await sendEmailToOwner(
      req,
      "Prepare Last Bills - Mismatch in total usages and cost calculations - SuSchool Management App",
      `There was a mismatch in the number of total usages and cost calculations for billing month: ${billingMonth}. Please investigate.`
    );
    throwError("Mismatch in total usages and cost calculations", 500);
  }

  await sendEmailToOwner(
    req,
    "Total Usages and Cost Calculations - SuSchool Management App",
    `The total usages for billing month: ${billingMonth} are as follows: ${JSON.stringify(totalUsages)}`
  );
  // calculate cost for each billing doc based on their percentage usage
  for (const billingDoc of billingDocs) {
    let totalCost = 0;
    for (const field of Object.keys(billingDoc)) {
      if (field in targetUsages && field in targetUsageRates) {
        if (field === "renderBaseCost") {
          const allotedCost = targetUsageRates[field] / billingDocs.length;
          (billingDoc as any)[field] = allotedCost;
          totalCost += allotedCost;
        } else {
          const usageValue = (billingDoc as any)[field].value;
          const percentageUsage = totalUsages[field] === 0 ? 0 : (usageValue / totalUsages[field]) * 100;
          const costForPercentageUsage =
            targetUsageRates[field] === 0 ? 0 : (percentageUsage / 100) * targetUsageRates[field];
          (billingDoc as any)[field].costInDollar = costForPercentageUsage;
          totalCost += costForPercentageUsage;
        }
      }
    }

    const featuresCost = billingDoc.featuresToCharge?.reduce((acc, feature) => acc + (feature.price ?? 0), 0);
    totalCost += billingDoc.organisationId.toString() === getOwnerMongoId() ? 0 : featuresCost;

    billingDoc.totalCost = totalCost;
    updatedBillingDocs.push(billingDoc);

    // update billing doc to the database
    const plainDoc = billingDoc;
    const { _id, ...rest } = plainDoc;

    const updatedBill = await Billing.findByIdAndUpdate(
      billingDoc._id,
      {
        ...rest,
        billingStatus: "Billed"
      },
      { new: true }
    ).lean();
    // check if the update was successful
    if (!updatedBill) {
      await sendEmailToOwner(
        req,
        "Prepare Last Bills - Error updating billing document - SuSchool Management App",
        `An error occurred while updating billing document ID: ${billingDoc._id} for billing month: ${billingMonth}.`
      );
      throwError("Error updating billing document", 500);
    }
  }

  return billingDocs;
};

export const prepareOldBills = async (req: Request, accountId: string) => {
  // confirm the user is the owner
  if (accountId !== getOwnerMongoId()) {
    await sendEmailToOwner(
      req,
      "Unauthorized Prepare Old Bills Attempt - SuSchool  Management App",
      `An unauthorized attempt to prepare old bills was made by account ID: ${accountId}.`
    );
    throwError("Unauthorized Action: Only owner account can perform this action", 403);
  }

  const billingMonth = getCurrentMonth();
  const billingDocs = await Billing.find({
    billingMonth: { $ne: billingMonth },
    subscriptionType: "Premium",
    billingStatus: "Not Billed"
  });

  // check if there are billing documents to process
  if (!billingDocs || billingDocs.length === 0) {
    await sendEmailToOwner(
      req,
      "Prepare Bills - No unbilled billing documents found - SuSchool Management App",
      `No unbilled billing documents were found during the prepare bills operation.`
    );

    return [];
  }

  let updatedBillingDocs: any[] = [];

  const targetUsages: any = {
    renderBaseCost: () => getRenderBaseRate(),
    renderComputeSeconds: () => getRenderComputeRate(),
    renderBandwidth: () => getRenderBandwidthRate(),
    databaseOperation: () => getDatabaseOperationsRate(),
    databaseDataTransfer: () => getDatabaseDataTransferRate(),
    databaseStorageAndBackup: () => getDatabaseDataStorageAndBackupRate(),
    cloudStorageGBStored: () => getCloudStorageGbStoredRate(),
    cloudStorageGBDownloaded: () => getCloudStorageGbDownloadedRate(),
    cloudStorageUploadOperation: () => getCloudStorageUploadOperationRate(),
    cloudStorageDownloadOperation: () => getCloudStorageDownloadOperationRate()
  };

  const targetUsageRates: any = {};
  for (const usage in targetUsages) {
    targetUsageRates[usage] = targetUsages[usage]();
  }

  const uniqueBillingDates = new Set(billingDocs.map((doc) => doc.billingMonth));
  for (const billingMonth of uniqueBillingDates) {
    const docsForDate = billingDocs.filter((doc) => doc.billingMonth === billingMonth);

    let totalUsages: any = {};

    // add all usages for the month
    for (const billingDoc of docsForDate) {
      for (const field of Object.keys(billingDoc.toObject())) {
        if (field in targetUsages) {
          totalUsages[field] = (totalUsages[field] || 0) + (billingDoc as any)[field].value;
        }
      }
    }

    const totalUsageDoc = await TotalUsage.create({ ...totalUsages, billingMonth, billingDate: getNextBillingDate() });
    if (!totalUsageDoc) {
      await sendEmailToOwner(
        req,
        "Prepare Old Bills - Failed to create total usage document - SuSchool Management App",
        `Failed to create total usage document for billing month: ${billingMonth}.`
      );
    }

    // calculate cost for total usages for each service

    // check if the number of total usages and cost calculations are the same
    if (Object.keys(totalUsages).length !== Object.keys(targetUsageRates).length) {
      await sendEmailToOwner(
        req,
        "Prepare Old Bills - Mismatch in total usages and cost calculations - SuSchool Management App",
        `There was a mismatch in the number of total usages and cost calculations for billing month: ${billingMonth}. Please investigate.`
      );
      throwError("Mismatch in total usages and cost calculations", 500);
    }

    await sendEmailToOwner(
      req,
      "Total Usages and Cost Calculations - SuSchool Management App",
      `The total usages and cost calculations for billing month: ${billingMonth} are as follows: ${JSON.stringify(
        totalUsages
      )}`
    );
    // calculate cost for each billing doc based on their percentage usage
    for (const billingDoc of docsForDate) {
      let totalCost = 0;
      for (const field of Object.keys(billingDoc.toObject())) {
        if (field in targetUsages && field in targetUsageRates) {
          if (field === "renderBaseCost") {
            const allotedCost = targetUsageRates[field] / docsForDate.length;
            (billingDoc as any)[field] = allotedCost;
            totalCost += allotedCost;
          } else {
            const usageValue = (billingDoc as any)[field].value;
            const percentageUsage = totalUsages[field] === 0 ? 0 : (usageValue / totalUsages[field]) * 100;
            const costForPercentageUsage =
              targetUsageRates[field] === 0 ? 0 : (percentageUsage / 100) * targetUsageRates[field];
            (billingDoc as any)[field].costInDollar = costForPercentageUsage;
            totalCost += costForPercentageUsage;
          }
        }
      }

      const featuresCost = billingDoc.featuresToCharge?.reduce((acc, feature) => acc + (feature.price ?? 0), 0);
      totalCost += billingDoc.organisationId.toString() === getOwnerMongoId() ? 0 : featuresCost;
      billingDoc.totalCost = totalCost;
      updatedBillingDocs.push(billingDoc);

      // update billing doc to the database
      const plainDoc = billingDoc.toObject();
      const { _id, ...rest } = plainDoc;

      const updatedBill = await Billing.findByIdAndUpdate(
        billingDoc._id,
        {
          ...rest,
          billingStatus: "Billed"
        },
        { new: true }
      );
      // check if the update was successful
      if (!updatedBill) {
        await sendEmailToOwner(
          req,
          "Prepare Old Bills - Error updating billing document - SuSchool Management App",
          `An error occurred while updating billing document ID: ${billingDoc._id} for billing month: ${billingMonth}.`
        );
        throwError("Error updating billing document", 500);
      }
    }
  }

  return billingDocs;
};

export const chargeLastBills = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // prepare last bills for charging
  const billedBillingDocs = await prepareLastBills(req, accountId);

  // get all unpaid and failed bills
  const billsToCharge = await Billing.find({
    subscriptionType: "Premium",
    paymentStatus: { $in: ["Unpaid", "Failed"] },
    billingStatus: "Billed"
  });
});

export const chargeOldBills = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // prepare old bills for charging
  const billedBillingDocs = await prepareOldBills(req, accountId);

  res.status(201).json("Old bills prepared and charged successfully");
});

export const inititalizeTransaction = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  const { email, amount } = req.body;

  if (!email || !amount) {
    await sendEmailToOwner(
      req,
      "Transaction Initiation Failed - SuSchool Management App",
      `Please fill in all required fields (email and amount)`
    );
    throwError("Please fill in all required fields (email and amount)", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  if (absoluteAdmin && accountId !== getOwnerMongoId()) {
    await sendEmailToOwner(
      req,
      "Unauthorised Action: Transaction Initiation Attempt - SuSchool Management App",
      `User with ID: ${accountId} and email: ${email} tried to initiate a transaction with amount: ${amount}`
    );
    throwError("Unauthorised Action: Only absolute admin can perform this action", 403);
    return;
  }

  const reference = generateCustomId("sulpay", false, "", 10, true);

  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      { email, amount: amount * 100, reference, channels: ["card"] },
      {
        headers: {
          Authorization: `Bearer ${getPaystackSecretKey()}`
        }
      }
    );

    if (response.status === 200) {
      res.status(200).json(response.data);
    }
  } catch (err: any) {
    throwError(err.message, err.statusCode || 500);
  }
});

export const paystackWebhook = asyncHandler(async (req: Request, res: Response) => {
  res.send(200);

  const hash = crypto.createHmac("sha512", getPaystackSecretKey()).update(JSON.stringify(req.body)).digest("hex");
  if (hash == req.headers["x-paystack-signature"]) {
    const event = req.body;

    // handle successful payment
    if (event.event === "charge.success") {
      const reference = event.data?.reference;
      const authorization = event.data?.authorization;
      const customer = event.data?.customer;

      const updatedSubscription = await Subscription.findOneAndUpdate();
    }
  }
});
