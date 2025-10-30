import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  throwError,
  logActivity,
  checkOrgAndUserActiveness,
  checkAccess,
  confirmUserOrgRole,
  fetchActivityLogs
} from "../../utils/utilsFunctions.ts";
import { ActivityLog } from "../../models/admin/activityLogModel.ts";

export const getActivityLogs = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { search = "", limit, cursorType, nextCursor, prevCursor, from, to, ...filters } = req.query;

  const parsedLimit = parseInt(limit as string);

  const queryOrgId = organisation!._id.toString();
  const query: any = { organisationId: userTokenOrgId };

  if (search) {
    query.searchText = { $regex: search, $options: "i" };
  }

  if (from && to) {
    query.createdAt = { $gte: new Date(from as string), $lte: new Date(to as string) };
  }

  for (const key in filters) {
    if (filters[key] !== "all") {
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
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Activity Logs");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchActivityLogs(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.activityLogs) {
      throwError("Error fetching activity logs", 500);
    }
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view activity logs - Please contact your admin", 403);
});

export const getLastActivityLog = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
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
    res.status(201).json(activityLog);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view activity logs - Please contact your admin", 403);
});

// export const fetchSpecificAccount = asyncHandler(async (req: Request, res: Response) => {
//   const { accountId, organisationId: userTokenOrgId } = req.userToken;

//   const { recordIdToFind, accountIdToFind, activityLogId } = req.body;

//   const { account, role, organisation } = await confirmUserOrgRole(accountId);

//   const { roleId } = account as any;
//   const { absoluteAdmin, tabAccess } = roleId;

//   const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

//   if (!checkPassed) {
//     throwError(message, 409);
//   }

//   const hasAccess = checkAccess(account, tabAccess, "View Activity Logs");

//   if (absoluteAdmin || hasAccess) {
//     const fetchedAccount = await Account.findById(
//       accountIdToFind,
//       "_id accountName accountEmail accountStatus"
//     ).populate([
//       { path: "roleId", select: "roleName" },
//       { path: "staffId", select: "staffId staffCustomId" }
//     ]);

//     if (!fetchedAccount) {
//       throwError("Error fetching account data", 500);
//     }

//     const fetchedRecord = await ActivityLog.findOne({_id: activityLogId, recordId: recordIdToFind, accountId: accountIdToFind });

//     res.status(200).json(fetchedAccount);
//   }

//   throwError("Unauthorised Action: You do not have access to view activity logs - Please contact your admin", 403);
// });
