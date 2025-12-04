import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Feature } from "../../models/admin/features.ts";
import {
  throwError,
  fetchRoles,
  emitToOrganisation,
  logActivity,
  checkOrgAndUserActiveness,
  checkAccess,
  confirmUserOrgRole,
  getObjectSize,
  toNegative,
  sendEmailToOwner,
  sendEmail
} from "../../utils/utilsFunctions.ts";

import { diff } from "deep-diff";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { Account } from "../../models/admin/accountModel.ts";

export const getFeatures = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const { account, role, organisation } = (await confirmUserOrgRole(accountId)) as any;

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "Update Features");

  if (absoluteAdmin || hasAccess) {
    const features = await Feature.find();

    if (!features) {
      throwError("Error fetching features", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + features.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([features, organisation, role, account])
      }
    ]);

    res.status(201).json(features);
    return;
  }

  throwError("Unauthorised Action: You do not have access to features - Please contact your admin", 403);
});
// controller to handle role update
export const purchaseFeature = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { _id: featureId } = req.body;

  if (!featureId) {
    throwError("Missing Feature Id - please refresh and try again", 400);
  }

  // confirm user
  const { account, role, organisation } = (await confirmUserOrgRole(accountId)) as any;

  const { roleId: creatorRoleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Update Features");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit roles - Please contact your admin", 403);
  }

  let feature = await Feature.findById(featureId);

  if (!feature) {
    throwError("An error occured whilst getting feature data - it may not be available anymore", 500);
  }

  if (feature?.availability !== "Available") {
    throwError("This feature is not currently available", 400);
  }

  if (feature?.mandatory) {
    throwError("This feature has already been added by default to your subscription", 400);
  }

  const featuresRequirements = feature?.requirements;

  const orgFeatures = organisation?.features?.map((f: any) => f.name);
  if (!featuresRequirements?.every((f: any) => orgFeatures.includes(f))) {
    throwError(
      "You need to have the following features to purchase this feature: " + featuresRequirements?.join(", "),
      400
    );
  }

  const orgAccount = await Account.findByIdAndUpdate(
    userTokenOrgId,
    {
      $push: {
        features: {
          _id: featureId,
          name: feature?.name,
          addedOn: new Date(),
          tabs: feature?.tabs,
          mandatory: feature?.mandatory
        }
      }
    },
    { new: true }
  ).select("organisationId accountName accountEmail accountPhone organisationInitial accountType features");

  if (!orgAccount) {
    sendEmailToOwner(
      "An error occured while adding feature to organisation account",
      `Organisation with the ID: ${userTokenOrgId} tried to add a feature to their account but failed`
    );
    throwError("An error occured while adding feature to your account", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Feature Purchased",
      "Feature",
      feature?._id,
      feature?.name,
      [
        {
          kind: "N",
          rhs: {
            _id: featureId,
            name: feature?.name,
            addedOn: new Date(),
            tabs: feature?.tabs,
            mandatory: feature?.mandatory
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([orgAccount, organisation, role, account, feature]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  sendEmail(
    orgAccount!.accountEmail,
    "Feature Purchased",
    `You have successfully added the feature: ${feature?.name} to your account. You will be charged for this feature from the next billing cycle`
  );
  sendEmailToOwner(
    "Feature Purchased",
    `The user: ${orgAccount?.accountName} has successfully added the feature: ${feature?.name} to their account. `
  );
  res.status(201).json(orgAccount);
  return;
});

export const removeFeatureAndKeepData = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { _id: featureId } = req.body;

  if (!featureId) {
    throwError("Missing Feature Id - please refresh and try again", 400);
  }

  // confirm user
  const { account, role, organisation } = (await confirmUserOrgRole(accountId)) as any;

  const { roleId: creatorRoleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Update Features");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit roles - Please contact your admin", 403);
  }

  const orgFeatures = organisation?.features?.map((f: any) => f.name);

  let allProviderFeatures = await Feature.find();

  const featureToRemove = allProviderFeatures.find((f: any) => f._id.toString() === featureId);
  if (!featureToRemove) {
    throwError("The feature you are trying to remove may not exist - please refresh and try again", 400);
  }

  const nonMandatoryFeatures = allProviderFeatures.filter((f: any) => !f.mandatory);
  const dependentFeatures = nonMandatoryFeatures.filter(
    (f: any) => orgFeatures.includes(f.name) && f.requirements.includes(featureToRemove?.name)
  );

  if (dependentFeatures.length > 0) {
    throwError(
      `This feature cannot be removed as it is a requirement for the following existing feature : (${dependentFeatures
        .map((f: any) => f.name)
        .join(", ")}) - You need to be removed them if you want to remove this feature`,
      400
    );
  }

  const orgAccount = await Account.findByIdAndUpdate(
    userTokenOrgId,
    {
      $set: {
        features: organisation?.features?.filter((f: any) => f._id.toString() !== featureId)
      }
    },
    { new: true }
  ).select("organisationId accountName accountEmail accountPhone organisationInitial accountType features");

  if (!orgAccount) {
    sendEmailToOwner(
      "An error occured while removing feature from organisation account",
      `Organisation with the ID: ${userTokenOrgId} tried to remove {${featureToRemove?.name}} to their account but failed`
    );
    throwError("An error occured while adding feature to your account", 500);
  }

  sendEmail(
    orgAccount!.accountEmail,
    "Feature Removed",
    `You have successfully removed the feature: ${featureToRemove?.name} from your account. You will still be charged for related data stored`
  );
  sendEmailToOwner(
    "Feature Removed - Remove Keep Data",
    `The user: ${orgAccount?.accountName} has successfully removed the feature: ${featureToRemove?.name} from their account. But their data will be kept`
  );

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Feature Removed - Remove Keep Data",
      "Feature",
      featureId,
      featureToRemove?.name,
      [
        {
          kind: "D",
          rhs: {
            _id: featureId,
            name: featureToRemove?.name,
            tabs: featureToRemove?.tabs,
            mandatory: featureToRemove?.mandatory
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) + allProviderFeatures.length },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([orgAccount, organisation, role, account, allProviderFeatures]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json(orgAccount);
  return;
});

// controller to handle deleting roles
