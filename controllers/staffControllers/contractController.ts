import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchStaffContracts,
  emitToOrganisation,
  logActivity,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  fetchAllStaffContracts
} from "../../utils/utilsFunctions.ts";

import { diff } from "deep-diff";
import { Staff } from "../../models/staff/profile.ts";
import { StaffContract } from "../../models/staff/contracts.ts";
import { AcademicYear } from "../../models/timeline/academicYear.ts";

const validateStaffContract = (staffDataParam: any) => {
  const {
    contractEndDate,
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
  const { accountId } = req.userToken;

  const { search = "", limit, cursorType, nextCursor, prevCursor, ...filters } = req.query;
  const parsedLimit = parseInt(limit as string);
  const query: any = {};

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

  // confirm role
  await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Staff Contracts");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchStaffContracts(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      absoluteAdmin ? "" : staffId.staffCustomId.toString()
    );

    if (!result || !result.staffContracts) {
      throwError("Error fetching staff contracts", 500);
    }
    deleteStaffContract;

    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view staff contracts - Please contact your admin", 403);
});

export const getAllStaffContracts = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  // confirm role
  await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Staff Contracts");

  if (absoluteAdmin || hasAccess) {
    const staffContracts = await fetchAllStaffContracts(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      absoluteAdmin ? "" : staffId.staffCustomId.toString()
    );

    if (!staffContracts) {
      throwError("Error fetching staff contracts", 500);
    }
    deleteStaffContract;

    res.status(201).json(staffContracts);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view staff contracts - Please contact your admin", 403);
});
// controller to handle role creation
export const createStaffContract = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const {
    academicYearId,
    academicYear,
    staffId,
    staffCustomId,
    staffFullName,
    jobTitle,
    contractStartDate,
    contractEndDate,
    contractType,
    contractStatus
  } = req.body;

  if (!validateStaffContract({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const staffExists = await Staff.findOne({ _id: staffId, organisationId: orgParsedId });
  if (!staffExists) {
    throwError(
      "This staff ID does not exist. Please provide the user staff Custom ID related to their staff record - or create one for them",
      409
    );
  }

  const academicYearExists = await AcademicYear.findOne({ _id: academicYearId, organisationId: orgParsedId });
  if (!academicYearExists) {
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const { roleId, accountStatus, staffId: userStaffId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Staff Contract");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create staff contract - Please contact your admin", 403);
  }

  const newStaffContract = await StaffContract.create({
    ...req.body,
    staffCustomId: staffCustomId,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      academicYear,
      staffCustomId,
      staffFullName,
      jobTitle,
      contractStartDate,
      contractEndDate,
      contractType,
      contractStatus
    ])
  });

  if (!newStaffContract) {
    throwError("Error creating staff contract", 500);
  }

  await logActivity(
    account?.organisationId,
    accountId,
    "Staff Contract Creation",
    "StaffContract",
    newStaffContract?._id,
    jobTitle,
    [
      {
        kind: "N",
        rhs: {
          _id: newStaffContract._id,
          academicYear,
          staffCustomId,
          staffFullName,
          jobTitle,
          contractStartDate,
          contractEndDate,
          contractType,
          contractStatus
        }
      }
    ],
    new Date()
  );

  res.status(201).json("successful");
});

// controller to handle role update
export const updateStaffContract = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const {
    academicYearId,
    academicYear,
    staffId,
    staffCustomId,
    staffFullName,
    jobTitle,
    contractStartDate,
    contractEndDate,
    responsibilities,
    contractType,
    contractStatus,
    contractSalary,
    workingSchedule
  } = req.body;

  if (!validateStaffContract({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Staff Contract");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit staff contract - Please contact your admin", 403);
  }

  const originalStaff = await StaffContract.findOne({ organisationId: orgParsedId, staffCustomId });

  if (!originalStaff) {
    throwError(
      "An error occured whilst getting old staff data - Please ensure this contract exists with the correct Id",
      500
    );
  }

  const academicYearExists = await AcademicYear.findOne({ _id: academicYearId, organisationId: orgParsedId });
  if (!academicYearExists) {
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const updatedStaffContract = await StaffContract.findByIdAndUpdate(
    originalStaff?._id,
    {
      ...req.body,
      searchText: generateSearchText([
        academicYear,
        staffCustomId,
        staffFullName,
        jobTitle,
        contractStartDate,
        contractEndDate,
        contractType,
        contractStatus
      ])
    },
    { new: true }
  );

  if (!updatedStaffContract) {
    throwError("Error updating staff contract", 500);
  }

  const difference = diff(originalStaff, updatedStaffContract);

  await logActivity(
    account?.organisationId,
    accountId,
    "Staff Contract Update",
    "StaffContract",
    updatedStaffContract?._id,
    staffFullName,
    difference,
    new Date()
  );
  res.status(201).json("successful");
});

// controller to handle deleting roles
export const deleteStaffContract = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { staffContractIDToDelete } = req.body;
  if (!staffContractIDToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Staff Contract");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete staff contract - Please contact your admin", 403);
  }

  const StaffContractToDelete = await StaffContract.findById(staffContractIDToDelete);

  if (!StaffContractToDelete) {
    throwError("Error finding staff contract - Please try again", 404);
  }

  const deletedStaffContract = await StaffContract.findByIdAndDelete(staffContractIDToDelete);
  if (!deletedStaffContract) {
    throwError("Error deleting staff contract - Please try again", 500);
  }

  const emitRoom = deletedStaffContract?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "staffcontracts", deletedStaffContract, "delete");

  await logActivity(
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

  res.status(201).json("successful");
});
