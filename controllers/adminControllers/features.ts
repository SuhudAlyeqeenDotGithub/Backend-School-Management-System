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
  sendEmailToOwner
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
  res.status(201).json(orgAccount);
  return;
});

// controller to handle deleting roles
