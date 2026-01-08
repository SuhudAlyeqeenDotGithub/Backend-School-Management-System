import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchProgrammeManagers,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllProgrammeManagers,
  checkAccesses
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { StaffContract } from "../../../models/staff/contracts";
import { ProgrammeManager } from "../../../models/curriculum/programme";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";
import { getNeededAccesses } from "../../../utils/defaultVariables.ts";

const validateProgrammeManager = (programmeManagerDataParam: any) => {
  const { managedUntil, ...copyLocalData } = programmeManagerDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllProgrammeManagers = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccesses(account, tabAccess, getNeededAccesses("All Programme Managers"));

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to view programme managers or one of it's required data (programmes) - Please contact your admin",
      403
    );
  }
  const result = await fetchAllProgrammeManagers(organisation!._id.toString(), staffId);

  if (!result) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching programme managers", 500);
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

export const getProgrammeManagers = asyncHandler(async (req: Request, res: Response) => {
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
    checkAccess(account, tabAccess, "View Programmes") && checkAccess(account, tabAccess, "View Programme Managers");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to view programme managers or one of it's required data (programmes) - Please contact your admin",
      403
    );
  }

  const result = await fetchProgrammeManagers(
    query,
    cursorType as string,
    parsedLimit,
    absoluteAdmin ? "Absolute Admin" : "User",
    organisation!._id.toString(),
    staffId
  );

  if (!result || !result.programmeManagers) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, result]) }
    ]);
    throwError("Error fetching programme managers", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.programmeManagers.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);
  res.status(201).json(result);
});

// controller to handle role creation
export const createProgrammeManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { programmeCustomId, programme, status, programmeId, managerFullName, staffId } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const staffHasContract = await StaffContract.findOne({
    organisationId: orgParsedId,
    staffId
  }).lean();
  if (!staffHasContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, staffHasContract]) }
    ]);
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }

  let programmeAlreadyManaged;

  if (status === "Active") {
    programmeAlreadyManaged = await ProgrammeManager.findOne({
      organisationId: orgParsedId,
      programmeId,
      staffId,
      status: "Active"
    }).lean();
    if (programmeAlreadyManaged) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([organisation, role, account, programmeAlreadyManaged, staffHasContract])
        }
      ]);
      throwError(
        "The staff is already an active manager of this programme - Please assign another staff or deactivate their current management, or set this current one to inactive",
        409
      );
    }
  }

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Programme Manager");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to create programme manager - Please contact your admin",
      403
    );
  }

  const newProgrammeManager = await ProgrammeManager.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([programmeId, programmeCustomId, programme, staffId, managerFullName])
  });

  if (!newProgrammeManager) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, newProgrammeManager]) }
    ]);
    throwError("Error creating programme manager", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Programme Manager Creation",
      "ProgrammeManager",
      newProgrammeManager?._id,
      managerFullName,
      [
        {
          kind: "N",
          rhs: newProgrammeManager
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 5 + (logActivityAllowed ? 2 : 0) + (status === "Active" ? 1 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newProgrammeManager) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newProgrammeManager, staffHasContract, organisation, role, account]) +
        (status === "Active" ? getObjectSize(programmeAlreadyManaged) : 0) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateProgrammeManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { programmeCustomId, programme, staffId, managerFullName } = body;

  if (!validateProgrammeManager(body)) {
    throwError("Please fill in all required fields", 400);
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Programme Manager");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to edit programme manager - Please contact your admin",
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

  const originalProgrammeManager = await ProgrammeManager.findById(body._id).lean();

  if (!originalProgrammeManager) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, staffHasContract, originalProgrammeManager])
      }
    ]);
    throwError("An error occured whilst getting old programme manager data, Ensure it has not been deleted", 500);
  }

  const updatedProgrammeManager = await ProgrammeManager.findByIdAndUpdate(
    originalProgrammeManager?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([programmeCustomId, programme, staffId, managerFullName])
    },
    { new: true }
  ).lean();

  if (!updatedProgrammeManager) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          organisation,
          role,
          account,
          updatedProgrammeManager,
          staffHasContract,
          originalProgrammeManager
        ])
      }
    ]);
    throwError("Error updating programme", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalProgrammeManager, updatedProgrammeManager);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Programme Manager Update",
      "ProgrammeManager",
      updatedProgrammeManager?._id,
      programme,
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
          updatedProgrammeManager,
          organisation,
          role,
          account,
          originalProgrammeManager,
          staffHasContract
        ]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteProgrammeManager = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Programme Manager");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to delete programme manager - Please contact your admin",
      403
    );
  }

  const deletedProgrammeManager = await ProgrammeManager.findByIdAndDelete(_id).lean();
  if (!deletedProgrammeManager) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, deletedProgrammeManager])
      }
    ]);
    throwError("Error deleting programme Manager - Please try again", 500);
  }

  const emitRoom = deletedProgrammeManager?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "programmemanagers", deletedProgrammeManager, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Programme Manager Deletion",
      "ProgrammeManager",
      deletedProgrammeManager?._id,
      deletedProgrammeManager?.managerFullName,
      [
        {
          kind: "D" as any,
          lhs: deletedProgrammeManager
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
        toNegative(getObjectSize(deletedProgrammeManager) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedProgrammeManager, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
