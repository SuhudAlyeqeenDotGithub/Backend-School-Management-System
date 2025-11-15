import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  throwError,
  checkOrgAndUserActiveness,
  checkAccess,
  confirmUserOrgRole,
  fetchBillings,
  getObjectSize
} from "../../utils/utilsFunctions.ts";
import { Subscription } from "../../models/admin/subscription.ts";
import { registerBillings } from "utils/billingFunctions.ts";

export const getBillings = asyncHandler(async (req: Request, res: Response) => {
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

  const hasAccess = checkAccess(account, tabAccess, "View Billings");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchBillings(query, cursorType as string, parsedLimit, organisation!._id.toString());

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
    return;
  }

  throwError("Unauthorised Action: You do not have access to view billings - Please contact your admin", 403);
});

export const getSubscription = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
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
