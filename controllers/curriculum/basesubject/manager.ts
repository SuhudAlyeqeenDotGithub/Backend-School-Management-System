import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchBaseSubjectManagers,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllBaseSubjectManagers,
  checkAccesses
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { StaffContract } from "../../../models/staff/contracts";
import { BaseSubjectManager } from "../../../models/curriculum/basesubject";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";
import { getNeededAccesses } from "../../../utils/defaultVariables.ts";

const validateBaseSubjectManager = (baseSubjectManagerDataParam: any) => {
  const { managedUntil, ...copyLocalData } = baseSubjectManagerDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllBaseSubjectManagers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccesses(account, tabAccess, getNeededAccesses("All Base Subject Managers"));

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete base subject - Please contact your admin", 403);
  }
  const result = await fetchAllBaseSubjectManagers(organisation!._id.toString(), staffId);

  if (!result) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching base subject teachers", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);
  res.status(201).json(result);
});

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

  const { roleId, staffId } = account as any;
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
    checkAccess(account, tabAccess, "View Base Subject Managers") &&
    checkAccess(account, tabAccess, "View Staff Profiles");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to view base subject managers or one of its required data (staff profiles) - Please contact your admin",
      403
    );
  }

  const result = await fetchBaseSubjectManagers(
    query,
    cursorType as string,
    parsedLimit,
    absoluteAdmin ? "Absolute Admin" : "User",
    organisation!._id.toString(),
    staffId
  );

  if (!result || !result.baseSubjectManagers) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching base subject managers", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.baseSubjectManagers.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);
  res.status(201).json(result);
});

// controller to handle role creation
export const createBaseSubjectManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { status, baseSubjectId, staffId, managerFullName } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Base Subject Manager");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to create base subject manager  - Please contact your admin",
      403
    );
  }

  const staffHasContract = await StaffContract.findOne({
    staffId
  }).lean();
  if (!staffHasContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }

  if (status === "Active") {
    const baseSubjectAlreadyManaged = await BaseSubjectManager.findOne({
      organisationId: orgParsedId,
      baseSubjectId,
      staffId,
      status: "Active"
    }).lean();
    if (baseSubjectAlreadyManaged) {
      registerBillings(req, [
        { field: "databaseOperation", value: 5 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([organisation, role, account, baseSubjectAlreadyManaged, staffHasContract])
        }
      ]);
      throwError(
        "The staff is already an active manager of this base subject - Please assign another staff or deactivate their current management, or set this current one to inactive",
        409
      );
    }
  }

  const newBaseSubjectManager = await BaseSubjectManager.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([baseSubjectId, staffId, managerFullName])
  });

  if (!newBaseSubjectManager) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error creating base subject manager", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Base Subject Manager Creation",
      "BaseSubjectManager",
      newBaseSubjectManager?._id,
      managerFullName,
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
  const { accountId } = req.userToken;
  const body = req.body;
  const { baseSubjectId, staffId, managerFullName } = body;

  if (!validateBaseSubjectManager(body)) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!.toString();

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Base Subject Manager");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to edit base subject manager - Please contact your admin",
      403
    );
  }

  const staffHasContract = await StaffContract.findOne({
    staffId
  }).lean();
  if (!staffHasContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }

  const originalBaseSubjectManager = await BaseSubjectManager.findOne({ _id: body._id }).lean();

  if (!originalBaseSubjectManager) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, staffHasContract]) }
    ]);
    throwError("An error occured whilst getting old base subject manager  data, Ensure it has not been deleted", 500);
  }

  const updatedBaseSubjectManager = await BaseSubjectManager.findByIdAndUpdate(
    originalBaseSubjectManager?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([baseSubjectId, staffId, managerFullName])
    },
    { new: true }
  ).lean();

  if (!updatedBaseSubjectManager) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, staffHasContract, originalBaseSubjectManager])
      }
    ]);
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
      managerFullName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([
          updatedBaseSubjectManager,
          organisation,
          role,
          account,
          staffHasContract,
          originalBaseSubjectManager
        ]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteBaseSubjectManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { _id } = req.body;
  if (!_id) {
    throwError("Unknown delete request - Please try again", 400);
  }

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Base Subject Manager");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to delete base subject manager  - Please contact your admin",
      403
    );
  }

  const deletedBaseSubjectManager = await BaseSubjectManager.findByIdAndDelete(_id).lean();
  if (!deletedBaseSubjectManager) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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
      deletedBaseSubjectManager?.managerFullName,
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
      value: 5 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value:
        toNegative(getObjectSize(deletedBaseSubjectManager) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedBaseSubjectManager, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
