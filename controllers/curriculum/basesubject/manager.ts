import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  throwError,
  generateSearchText,
  fetchBaseSubjectManagers,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  getObjectSize,
  toNegative
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";
import { StaffContract } from "../../../models/staff/contracts";
import { BaseSubjectManager } from "../../../models/curriculum/basesubject";
import { registerBillings } from "../../../utils/billingFunctions.ts";

const validateBaseSubjectManager = (baseSubjectManagerDataParam: any) => {
  const { managedUntil, _id, ...copyLocalData } = baseSubjectManagerDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getBaseSubjectManagers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { search = "", limit, cursorType, nextCursor, prevCursor, ...filters } = req.query;

  const parsedLimit = parseInt(limit as string);

  const query: any = { organisationId: userTokenOrgId };
  if (search) {
    query.searchText = { $regex: search, $options: "i" };
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

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Base Subject Managers");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchBaseSubjectManagers(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      staffId
    );

    if (!result || !result.baseSubjectManagers) {
      throwError("Error fetching base subject manager s", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.baseSubjectManagers.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view base subject - Please contact your admin", 403);
});

// controller to handle role creation
export const createBaseSubjectManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;

  const {
    baseSubjectCustomId,
    status,
    baseSubjectId,
    baseSubjectName,
    baseSubjectManagerCustomStaffId,
    baseSubjectManagerFullName
  } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const staffHasContract = await StaffContract.findOne({
    organisationId: orgParsedId,
    staffCustomId: baseSubjectManagerCustomStaffId
  });
  if (!staffHasContract) {
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }

  if (status === "Active") {
    const baseSubjectAlreadyManaged = await BaseSubjectManager.findOne({
      organisationId: orgParsedId,
      baseSubjectId,
      baseSubjectManagerCustomStaffId,
      status: "Active"
    });
    if (baseSubjectAlreadyManaged) {
      throwError(
        "The staff is already an active manager of this base subject - Please assign another staff or deactivate their current management, or set this current one to inactive",
        409
      );
    }
  }

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Base Subject Manager");

  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create base subject manager  - Please contact your admin",
      403
    );
  }

  const newBaseSubjectManager = await BaseSubjectManager.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      baseSubjectCustomId,
      baseSubjectName,
      baseSubjectManagerCustomStaffId,
      baseSubjectManagerFullName
    ])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Base Subject Manager Creation",
      "BaseSubjectManager",
      newBaseSubjectManager?._id,
      baseSubjectManagerFullName,
      [
        {
          kind: "N",
          rhs: newBaseSubjectManager
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newBaseSubjectManager) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newBaseSubjectManager, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateBaseSubjectManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const { baseSubjectCustomId, baseSubjectName, baseSubjectManagerCustomStaffId, baseSubjectManagerFullName } = body;

  if (!validateBaseSubjectManager(body)) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!.toString();

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Base Subject Manager");

  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to edit base subject manager  - Please contact your admin",
      403
    );
  }

  const originalBaseSubjectManager = await BaseSubjectManager.findOne({ _id: body._id });

  if (!originalBaseSubjectManager) {
    throwError("An error occured whilst getting old base subject manager  data, Ensure it has not been deleted", 500);
  }

  const updatedBaseSubjectManager = await BaseSubjectManager.findByIdAndUpdate(
    originalBaseSubjectManager?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([
        baseSubjectCustomId,
        baseSubjectName,
        baseSubjectManagerCustomStaffId,
        baseSubjectManagerFullName
      ])
    },
    { new: true }
  );

  if (!updatedBaseSubjectManager) {
    throwError("Error updating base subject", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalBaseSubjectManager, updatedBaseSubjectManager);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Base Subject Manager Update",
      "BaseSubjectManager",
      updatedBaseSubjectManager?._id,
      baseSubjectName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedBaseSubjectManager, organisation, role, account, originalBaseSubjectManager]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteBaseSubjectManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { baseSubjectManagerId } = req.body;
  if (!baseSubjectManagerId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Base Subject Manager");
  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to delete base subject manager  - Please contact your admin",
      403
    );
  }

  const baseSubjectManagerToDelete = await BaseSubjectManager.findOne({
    _id: baseSubjectManagerId
  });

  if (!baseSubjectManagerToDelete) {
    throwError("Error finding base subject manager with provided Custom Id - Please try again", 404);
  }

  const deletedBaseSubjectManager = await BaseSubjectManager.findByIdAndDelete(
    baseSubjectManagerToDelete?._id.toString()
  );
  if (!deletedBaseSubjectManager) {
    throwError("Error deleting base subject manager - Please try again", 500);
  }

  const emitRoom = deletedBaseSubjectManager?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "basesubjectmanagers", deletedBaseSubjectManager, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Base Subject Manager Deletion",
      "BaseSubjectManager",
      deletedBaseSubjectManager?._id,
      deletedBaseSubjectManager?.baseSubjectManagerFullName,
      [
        {
          kind: "D" as any,
          lhs: deletedBaseSubjectManager
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 6 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value:
        toNegative(getObjectSize(deletedBaseSubjectManager) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedBaseSubjectManager, organisation, role, account, baseSubjectManagerToDelete]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
