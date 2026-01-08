import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import {
  emitToOrganisation,
  logActivity,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchPeriods
} from "../../utils/databaseFunctions.ts";
import { throwError, toNegative, getObjectSize } from "../../utils/pureFuctions.ts";

import { diff } from "deep-diff";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { Period } from "../../models/timeline/period.ts";

export const getPeriods = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { search = "", limit, cursorType, nextCursor, prevCursor, ...filters } = req.query;

  const parsedLimit = parseInt(limit as string);

  const query: any = { organisationId: userTokenOrgId };
  if (search) {
    query.searchText = { $regex: search, $options: "i" };
  }

  for (const key in filters) {
    if (filters[key] !== "all" && filters[key] && filters[key] !== "undefined" && filters[key] !== "null") {
      query[key] = filters[key];
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
  const hasAccess =
    checkAccess(account, tabAccess, "View Academic Years") || checkAccess(account, tabAccess, "View Periods");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view periods - Please contact your admin", 403);
  }

  const result = await fetchPeriods(query, cursorType as string, parsedLimit, organisation!._id.toString());

  if (!result || !result.periods) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching periods", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.periods.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);
  res.status(201).json(result);
});

// controller to handle role creation
export const createPeriod = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId } = req.userToken;
  const { period, startDate, endDate, academicYearId, customId, academicYear } = req.body;

  // validate input
  if (!period || !startDate || !endDate) {
    throwError("Please fill in all required fields", 400);
  }
  if (!academicYearId || !customId) {
    throwError("error attaching required fields - Please try again", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess =
    checkAccess(account, creatorTabAccess, "Create Academic Year") ||
    checkAccess(account, creatorTabAccess, "Create Period");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create academic year - Please contact your admin", 403);
  }
  const periodNameExists = await Period.findOne({ academicYearId, period: period }).lean();
  if (periodNameExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("This period name is already in use under the same academic year - Please use a different name", 409);
  }

  const newPeriod = await Period.create({
    period,
    startDate,
    endDate,
    academicYearId,
    customId,
    academicYear,
    organisationId
  });

  if (!newPeriod) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, periodNameExists]) }
    ]);
    throwError("Error creating period", 500);
  }
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
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess =
    checkAccess(account, creatorTabAccess, "Edit Academic Year") ||
    checkAccess(account, creatorTabAccess, "Edit Period");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit academic year - Please contact your admin", 403);
  }

  const originalPeriod = await Period.findById(periodId).lean();

  if (!originalPeriod) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("An error occured whilst getting old period data", 500);
  }

  const updatedPeriod = await Period.findByIdAndUpdate(
    periodId,
    {
      ...req.body
    },
    { new: true }
  ).lean();

  if (!updatedPeriod) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, originalPeriod]) }
    ]);
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
  const { _id: periodIdToDelete } = req.body;
  if (!periodIdToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId ?? { absoluteAdmin: false, tabAccess: [] };
  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess =
    checkAccess(account, creatorTabAccess, "Delete Academic Year") ||
    checkAccess(account, creatorTabAccess, "Delete Period");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete academic year - Please contact your admin", 403);
  }

  const deletedPeriod = await Period.findByIdAndDelete(periodIdToDelete).lean();
  if (!deletedPeriod) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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
      deletedPeriod?.period,
      [
        {
          kind: "D" as any,
          lhs: deletedPeriod
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 5 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: toNegative(getObjectSize(deletedPeriod) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedPeriod, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json(periodIdToDelete);
});
