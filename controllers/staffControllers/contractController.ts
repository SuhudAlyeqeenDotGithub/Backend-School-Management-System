import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../models/admin/accountModel";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchStaffContracts,
  userIsStaff,
  emitToOrganisation,
  logActivity
} from "../../utils/utilsFunctions";

import { diff } from "deep-diff";
import { Staff } from "../../models/staff/profile";
import { StaffContract } from "../../models/staff/contracts";
import { AcademicYear } from "../../models/general/academicYear";
import { parse } from "path";

declare global {
  namespace Express {
    interface Request {
      userToken?: any;
    }
  }
}

const validateStaffContract = (staffDataParam: any) => {
  const { contractEndDate, workingSchedule, responsibilities, searchText, ...copyLocalData } = staffDataParam;

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

  const { search = "", limit = 2, cursorType, nextCursor, prevCursor, ...filters } = req.query;

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
    if (nextCursor) {
      query._id = { $lt: nextCursor };
    } else if (prevCursor) {
      query._id = { $gt: prevCursor };
    }
  }

  // confirm user
  const account = await confirmAccount(accountId);

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  // confirm role
  await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = tabAccess
    .filter(({ tab }: any) => tab === "Staff")[0]
    .actions.some(({ name }: any) => name === "View Staff Contracts");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchStaffContracts(
      query,
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
  const account = await confirmAccount(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const organisation = await confirmAccount(orgParsedId);

  const contractExists = await StaffContract.findOne({
    academicYearId: academicYearId,
    organisationId: orgParsedId,
    jobTitle
  });
  if (contractExists) {
    throwError("This contract probably already exist - Please use a different job title", 409);
  }

  const staffExists = await Staff.findOne({ _id: staffId, organisationId: orgParsedId });
  if (!staffExists) {
    throwError(
      "This staff ID does not exist. Please provide the user staff Custom ID related to their staff record - or create one for them",
      409
    );
  }

  const { roleId, accountStatus, staffId: userStaffId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab }: any) => tab === "Staff")[0]
    .actions.some(({ name, permission }: any) => name === "Create Staff Contract" && permission === true);

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

  throwError("Unauthorised Action: You do not have access to create staff contracts - Please contact your admin", 403);
});

// controller to handle role update
export const updateStaffContract = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const {
    staffCustomId,
    academicYearId,
    staffFirstName,
    staffMiddleName,
    staffLastName,
    staffDateOfBirth,
    staffGender,
    staffPhone,
    staffEmail,
    staffAddress,
    staffPostCode,
    staffImage,
    staffImageDestination,
    staffMaritalStatus,
    staffStartDate,
    staffEndDate,
    staffNationality,
    staffAllergies,
    staffNextOfKinName,
    staffNextOfKinRelationship,
    staffNextOfKinPhone,
    staffNextOfKinEmail,
    staffQualification
  } = req.body;

  const copyBody = {
    staffCustomId,
    staffFirstName,
    staffMiddleName,
    staffLastName,
    staffDateOfBirth,
    staffGender,
    staffPhone,
    staffEmail,
    staffAddress,
    staffPostCode,
    staffImage,
    staffImageDestination,
    staffMaritalStatus,
    staffStartDate,
    staffEndDate,
    staffNationality,
    staffAllergies,
    staffNextOfKinName,
    staffNextOfKinRelationship,
    staffNextOfKinPhone,
    staffNextOfKinEmail,
    staffQualification
  };

  if (!validateStaffContract(copyBody)) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const account = await confirmAccount(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const organisation = await confirmAccount(orgParsedId);

  const { roleId, accountStatus, staffId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab }: any) => tab === "Staff")[0]
    .actions.some(({ name, permission }: any) => name === "Edit Staff" && permission === true);

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit staff - Please contact your admin", 403);
  }

  const originalStaff = await Staff.findOne({ staffCustomId });

  if (!originalStaff) {
    throwError("An error occured whilst getting old staff data", 500);
  }

  const updatedStaff = await Staff.findByIdAndUpdate(
    originalStaff?._id.toString(),
    {
      ...copyBody,
      searchText: generateSearchText([
        staffCustomId,
        staffFirstName,
        staffGender,
        staffMiddleName,
        staffLastName,
        staffEmail,
        staffDateOfBirth,
        staffNationality,
        staffNextOfKinName,
        staffCustomId
      ])
    },
    { new: true }
  );

  if (!updatedStaff) {
    throwError("Error updating staff profile", 500);
  }

  const difference = diff(originalStaff, updatedStaff);
  const staffFullName =
    updatedStaff?.staffFirstName + " " + updatedStaff?.staffMiddleName + " " + updatedStaff?.staffLastName.trim();

  await logActivity(
    account?.organisationId,
    accountId,
    "Staff Profile Update",
    "Staff",
    updatedStaff?._id,
    staffFullName,
    difference,
    new Date()
  );

  throwError("Unauthorised Action: You do not have access to view staff profile - Please contact your admin", 403);
});

// controller to handle deleting roles
export const deleteStaffContract = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { staffIDToDelete, academicYearId } = req.body;
  if (!staffIDToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }
  // confirm user
  const account = await confirmAccount(accountId);
  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());
  const { roleId: creatorRoleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;
  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }
  const hasAccess = creatorTabAccess
    .filter(({ tab, actions }: any) => tab === "Staff")[0]
    .actions.some(({ name, permission }: any) => name === "Delete Sta" && permission === true);
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete staff profile - Please contact your admin", 403);
  }

  const StaffContractToDelete = await Staff.findOne({
    staffCustomId: staffIDToDelete,
    organisationId: organisation?._id.toString()
  });

  if (!StaffContractToDelete) {
    throwError("Error finding staff contract with provided Custom Id - Please try again", 404);
  }

  const deletedStaffContract = await Staff.findByIdAndDelete(StaffContractToDelete?._id.toString());
  if (!deletedStaffContract) {
    throwError("Error deleting staff contract - Please try again", 500);
  }

  const emitRoom = deletedStaffContract?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "staffs");

  const staffFullName =
    deletedStaffContract?.staffFirstName +
    " " +
    deletedStaffContract?.staffMiddleName +
    " " +
    deletedStaffContract?.staffLastName;

  await logActivity(
    account?.organisationId,
    accountId,
    "User Delete",
    "Staff",
    deletedStaffContract?._id,
    staffFullName.trim(),
    [
      {
        kind: "D" as any,
        lhs: {
          _id: deletedStaffContract?._id,
          staffCustomId: deletedStaffContract?.staffCustomId,
          staffFullName: staffFullName.trim(),
          staffEmail: deletedStaffContract?.staffEmail,
          staffNextOfKinName: deletedStaffContract?.staffNextOfKinName,
          staffQualification: deletedStaffContract?.staffQualification
        }
      }
    ],
    new Date()
  );

  throwError("Unauthorised Action: You do not have access to view staff profile - Please contact your admin", 403);
});
