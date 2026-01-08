import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  checkOrgAndUserActiveness,
  checkAccess,
  confirmUserOrgRole,
  fetchActivityLogs
} from "../../utils/databaseFunctions.ts";
import { ActivityLog } from "../../models/admin/activityLogModel.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { getObjectSize, throwError } from "../../utils/pureFuctions.ts";

export const getActivityLogs = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { search = "", limit, cursorType, nextCursor, prevCursor, from, to, ...filters } = req.query;

  const parsedLimit = parseInt(limit as string);

  const query: any = { organisationId: userTokenOrgId };

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
  const hasAccess = checkAccess(account, tabAccess, "View Activity Logs");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchActivityLogs(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.activityLogs) {
      throwError("Error fetching activity logs", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.activityLogs.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, account, role, organisation])
      }
    ]);

    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view activity logs - Please contact your admin", 403);
});

export const getLastActivityLog = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

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
  const hasAccess = checkAccess(account, tabAccess, "View Activity Logs");

  if (absoluteAdmin || hasAccess) {
    const activityLog = await ActivityLog.findOne()
      .sort({ _id: -1 })
      .limit(1)
      .populate([{ path: "accountId", populate: [{ path: "staffId" }, { path: "roleId" }] }, { path: "recordId" }]);

    if (!activityLog) {
      throwError("Error fetching activity Logs - Refresh manually to see latest logs", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([activityLog, account, role, organisation])
      }
    ]);
    res.status(201).json(activityLog);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view activity logs - Please contact your admin", 403);
});
