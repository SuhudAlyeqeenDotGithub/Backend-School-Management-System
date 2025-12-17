import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchStaffContracts,
  emitToOrganisation,
  logActivity,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  fetchAllStaffContracts
} from "../../utils/databaseFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../utils/pureFuctions.ts";

import { diff } from "deep-diff";
import { Staff } from "../../models/staff/profile.ts";
import { StaffContract } from "../../models/staff/contracts.ts";
import { AcademicYear } from "../../models/timeline/academicYear.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";

const validateStaffContract = (staffDataParam: any) => {
  const {
    endDate,
    workingSchedule,
    responsibilities,
    probationStartDate,
    probationEndDate,
    department,
    allowances,
    probationMonths,
    terminationNoticePeriod,
    reportingManagerCustomId,
    searchText,
    ...copyLocalData
  } = staffDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getStaffContracts = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

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

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }

  const hasAccess =
    checkAccess(account, tabAccess, "View Staff Contracts") &&
    checkAccess(account, tabAccess, "View Academic Years") &&
    checkAccess(account, tabAccess, "View Staff Profiles");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to view staff contracts or one of it's required data (academic years, staff profiles) - Please contact your admin",
      403
    );
  }
  const result = await fetchStaffContracts(
    query,
    cursorType as string,
    parsedLimit,
    absoluteAdmin ? "Absolute Admin" : "User",
    organisation!._id.toString(),
    absoluteAdmin ? "" : staffId._id.toString()
  );

  if (!result || !result.staffContracts) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching staff contracts", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.staffContracts.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);

  res.status(201).json(result);
});

export const getAllStaffContracts = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "View Staff Contracts");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view staff contracts - Please contact your admin", 403);
  }
  
  const staffContracts = await fetchAllStaffContracts(
    absoluteAdmin ? "Absolute Admin" : "User",
    organisation!._id.toString(),
    absoluteAdmin ? "" : staffId._id.toString()
  );

  if (!staffContracts) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching staff contracts", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + staffContracts.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([staffContracts, organisation, role, account])
    }
  ]);
  res.status(201).json(staffContracts);
});
// controller to handle role creation
export const createStaffContract = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { academicYearId, academicYear, staffId, jobTitle, staffFullName } = req.body;

  if (!validateStaffContract({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Staff Contract");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create staff contract - Please contact your admin", 403);
  }

  const staffExists = await Staff.findOne({ _id: staffId });
  if (!staffExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "This staff ID does not exist. Please provide the user staff Custom ID related to their staff record - or create one for them",
      409
    );
  }

  const academicYearExists = await AcademicYear.findOne({ _id: academicYearId, organisationId: orgParsedId });
  if (!academicYearExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, staffExists]) }
    ]);
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const newStaffContract = await StaffContract.create({
    ...req.body,
    organisationId: orgParsedId,
    searchText: generateSearchText([academicYear, staffId, staffFullName, jobTitle])
  });

  if (!newStaffContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, staffExists, academicYearExists])
      }
    ]);
    throwError("Error creating staff contract", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Staff Contract Creation",
      "StaffContract",
      newStaffContract?._id,
      staffFullName,
      [
        {
          kind: "N",
          rhs: newStaffContract
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newStaffContract) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newStaffContract, academicYearExists, staffExists, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});

// controller to handle role update
export const updateStaffContract = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { academicYearId, academicYear, staffId, jobTitle, staffFullName, _id } = req.body;

  if (!validateStaffContract({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Staff Contract");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit staff contract - Please contact your admin", 403);
  }
  const originalStaff = await StaffContract.findById(_id).lean();

  if (!originalStaff) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "An error occured whilst getting old staff data - Please ensure this contract exists with the correct Id",
      500
    );
  }

  const academicYearExists = await AcademicYear.findOne({ _id: academicYearId }).lean();
  if (!academicYearExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, originalStaff]) }
    ]);
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const updatedStaffContract = await StaffContract.findByIdAndUpdate(
    originalStaff?._id,
    {
      ...req.body,
      searchText: generateSearchText([academicYear, staffId, staffFullName, jobTitle])
    },
    { new: true }
  ).lean();

  if (!updatedStaffContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([updatedStaffContract, academicYearExists, organisation, role, account, originalStaff])
      }
    ]);
    throwError("Error updating staff contract", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalStaff, updatedStaffContract);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Staff Contract Update",
      "StaffContract",
      updatedStaffContract?._id,
      staffFullName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedStaffContract, academicYearExists, organisation, role, account, originalStaff]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successful");
});

// controller to handle deleting roles
export const deleteStaffContract = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { _id } = req.body;

  console.log("_id", _id);
  if (!_id) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Staff Contract");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete staff contract - Please contact your admin", 403);
  }

  const deletedStaffContract = await StaffContract.findByIdAndDelete(_id).lean();
  if (!deletedStaffContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting staff contract - Please try again", 500);
  }

  const emitRoom = deletedStaffContract?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "staffcontracts", deletedStaffContract, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Staff Contract Delete",
      "StaffContract",
      deletedStaffContract?._id,
      deletedStaffContract?._id.toString(),
      [
        {
          kind: "D" as any,
          lhs: deletedStaffContract
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
      value: toNegative(getObjectSize(deletedStaffContract) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedStaffContract, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});
