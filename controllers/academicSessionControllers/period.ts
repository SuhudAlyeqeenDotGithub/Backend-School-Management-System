import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import {
  emitToOrganisation,
  logActivity,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole
} from "../../utils/databaseFunctions.ts";
import { throwError, toNegative, getObjectSize } from "../../utils/pureFuctions.ts";

import { diff } from "deep-diff";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { Period } from "../../models/timeline/period.ts";

// controller to handle role creation
export const createPeriod = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { period, startDate, endDate, academicYearId, customId, academicYear } = req.body;

  // validate input
  if (!period || !startDate || !endDate) {
    throwError("Please fill in all required fields", 400);
  }
  if (!academicYearId || !customId || !academicYear) {
    throwError("error attaching required fields - Please try again", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const periodNameExists = await Period.findOne({ academicYearId, period: period });
  if (periodNameExists) {
    throwError("This period name is already in use under a same academic year - Please use a different name", 409);
  }

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Academic Year");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create academic year - Please contact your admin", 403);
  }

  const newPeriod = await Period.create({
    period,
    startDate,
    endDate,
    academicYearId,
    customId,
    academicYear,
    organisationId: orgParsedId
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Period Creation",
      "Period",
      newPeriod?._id,
      newPeriod?.period,
      [
        {
          kind: "N",
          rhs: {
            _id: newPeriod?._id,
            period: newPeriod?.period,
            startDate: newPeriod?.startDate,
            endDate: newPeriod?.endDate
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 8 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize([newPeriod]) * 2 + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newPeriod, organisation, role, account, periodNameExists, newPeriod]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json(newPeriod);
});

// controller to handle role update
export const updatePeriod = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { _id: periodId, period, startDate, endDate, academicYearId, customId, academicYear } = req.body;

  // validate input
  if (!period || !startDate || !endDate) {
    throwError("Please fill in all required fields", 400);
  }
  if (!periodId || !academicYearId || !customId || !academicYear) {
    throwError("error attaching required fields - Please try again", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Academic Year");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit academic year - Please contact your admin", 403);
  }

  const originalPeriod = await Period.findById(periodId);

  if (!originalPeriod) {
    throwError("An error occured whilst getting old period data", 500);
  }

  const updatedPeriod = await Period.findByIdAndUpdate(
    periodId,
    {
      ...req.body
    },
    { new: true }
  );

  if (!updatedPeriod) {
    throwError("Error updating academic year", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalPeriod, updatedPeriod);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Period Update",
      "Period",
      updatedPeriod?._id,
      period,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedPeriod, organisation, role, account, originalPeriod]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json(updatedPeriod);
});

// controller to handle deleting roles
export const deletePeriod = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { periodIdToDelete } = req.body;
  if (!periodIdToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;
  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Academic Year");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete academic year - Please contact your admin", 403);
  }

  const periodToDelete = await Period.findById(periodIdToDelete);

  if (!periodToDelete) {
    throwError("Error finding period - It could have been deleted, Please try again", 404);
  }

  const deletedPeriod = await Period.findByIdAndDelete(periodIdToDelete);
  if (!deletedPeriod) {
    throwError("Error deleting period - Please try again", 500);
  }

  const emitRoom = deletedPeriod?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "periods", deletedPeriod, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Period Deletion",
      "Period",
      deletedPeriod?._id,
      periodToDelete?.period,
      [
        {
          kind: "D" as any,
          lhs: periodToDelete
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: toNegative(getObjectSize(deletedPeriod) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedPeriod, organisation, role, account, periodIdToDelete]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json(periodIdToDelete);
});
