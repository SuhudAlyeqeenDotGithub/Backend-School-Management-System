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
  toNegative
} from "../../utils/utilsFunctions.ts";

import { diff } from "deep-diff";
import { registerBillings } from "../../utils/billingFunctions.ts";

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
export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { roleId, roleName, roleDescription, tabAccess } = req.body;

  if (!roleName) {
    throwError("Please provide the role name", 400);
  }

  // confirm user
  const { account, role, organisation } = (await confirmUserOrgRole(accountId)) as any;

  const { roleId: creatorRoleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess, _id: selfRoleId } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Role");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit roles - Please contact your admin", 403);
  }

  //     let activityLog;
  //   const logActivityAllowed = organisation?.settings?.logActivity;

  //   if (logActivityAllowed) {
  //     const difference = diff(originalRole, updatedRole);
  //     activityLog = await logActivity(
  //       account?.organisationId,
  //       accountId,
  //       "Role Update",
  //       "Role",
  //       updatedRole?._id,
  //       roleName,
  //       difference,
  //       new Date()
  //     );
  //   }

  //   registerBillings(req, [
  //     { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
  //     {
  //       field: "databaseDataTransfer",
  //       value:
  //         getObjectSize([updatedRole, organisation, role, account, originalRole]) +
  //         (logActivityAllowed ? getObjectSize(activityLog) : 0)
  //     }
  //   ]);
  res.status(201).json("successfull");
  return;
});

// controller to handle deleting roles
