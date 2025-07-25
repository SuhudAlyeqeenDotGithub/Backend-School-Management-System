import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../models/admin/accountModel";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchAcademicYears,
  userIsStaff,
  emitToOrganisation,
  logActivity
} from "../../utils/utilsFunctions";

import { diff } from "deep-diff";
import { Staff } from "../../models/staff/profile";
import { AcademicYear } from "../../models/general/academicYear";
import { parse } from "path";

declare global {
  namespace Express {
    interface Request {
      userToken?: any;
    }
  }
}

const validateAcademicYear = (staffDataParam: any) => {
  const {
    staffCustomId,
    staffImage,
    staffImageDestination,
    staffMiddleName,
    staffQualification,
    staffPostCode,
    staffEndDate,
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

export const getAcademicYears = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const account = await confirmAccount(accountId);

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  // confirm role
  const role = await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = tabAccess
    .filter(({ tab }: any) => tab === "Academic Year")[0]
    .actions.some(({ name }: any) => name === "View Academic Years");

  if (absoluteAdmin || hasAccess) {
    const academicYears = await fetchAcademicYears(organisation!._id.toString());

    if (!academicYears) {
      throwError("Error fetching academic years", 500);
    }
    res.status(201).json(academicYears);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view academic years - Please contact your admin", 403);
});

// controller to handle role creation
export const createAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { academicYear, startDate, endDate } = req.body;

  // validate input
  if (!academicYear || !startDate || !endDate) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const account = await confirmAccount(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const organisation = await confirmAccount(orgParsedId);

  const yearNameExists = await AcademicYear.findOne({ academicYear, organisationId: orgParsedId });
  if (yearNameExists) {
    throwError("This academic year name is already in use in this organisation - Please use a different name", 409);
  }

  const { roleId, accountStatus, accountName, staffId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab }: any) => tab === "Academic Year")[0]
    .actions.some(({ name, permission }: any) => name === "Create Academic Year" && permission === true);

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create academic year - Please contact your admin", 403);
  }

  const newAcademicYear = await AcademicYear.create({
    academicYear,
    startDate,
    endDate,
    organisationId: orgParsedId,
    searchText: generateSearchText([academicYear, startDate, endDate])
  });

  await logActivity(
    account?.organisationId,
    accountId,
    "Academic Year Creation",
    "AcademicYear",
    newAcademicYear?._id,
    newAcademicYear?.academicYear,
    [
      {
        kind: "N",
        rhs: {
          _id: newAcademicYear?._id,
          academicYear: newAcademicYear?.academicYear,
          startDate: newAcademicYear?.startDate,
          endDate: newAcademicYear?.endDate,
          searchText: newAcademicYear?.searchText
        }
      }
    ],
    new Date()
  );

  if (absoluteAdmin || hasAccess) {
    const academicYears = await fetchAcademicYears(orgParsedId);

    if (!academicYears) {
      throwError("Error fetching academic years", 500);
    }
    res.status(201).json(academicYears);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view academic year - Please contact your admin", 403);
});

// controller to handle role update
export const updateAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const {
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

  if (!validateAcademicYear(copyBody)) {
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
    throwError("Error updating academic year", 500);
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

  if (absoluteAdmin || hasAccess) {
    const academicYears = await fetchAcademicYears(organisation!._id.toString());

    if (!academicYears) {
      throwError("Error fetching academic years", 500);
    }
    res.status(201).json(academicYears);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view academic year - Please contact your admin", 403);
});

// controller to handle deleting roles
export const deleteAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { staffIDToDelete } = req.body;
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
    throwError("Unauthorised Action: You do not have access to delete academic year - Please contact your admin", 403);
  }

  const AcademicYearToDelete = await Staff.findOne({
    staffCustomId: staffIDToDelete,
    organisationId: organisation?._id.toString()
  });

  if (!AcademicYearToDelete) {
    throwError("Error finding staff contract with provided Custom Id - Please try again", 404);
  }

  const deletedAcademicYear = await Staff.findByIdAndDelete(AcademicYearToDelete?._id.toString());
  if (!deletedAcademicYear) {
    throwError("Error deleting staff contract - Please try again", 500);
  }

  const emitRoom = deletedAcademicYear?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "staffs");

  const staffFullName =
    deletedAcademicYear?.staffFirstName +
    " " +
    deletedAcademicYear?.staffMiddleName +
    " " +
    deletedAcademicYear?.staffLastName;

  await logActivity(
    account?.organisationId,
    accountId,
    "User Delete",
    "Staff",
    deletedAcademicYear?._id,
    staffFullName.trim(),
    [
      {
        kind: "D" as any,
        lhs: {
          _id: deletedAcademicYear?._id,
          staffCustomId: deletedAcademicYear?.staffCustomId,
          staffFullName: staffFullName.trim(),
          staffEmail: deletedAcademicYear?.staffEmail,
          staffNextOfKinName: deletedAcademicYear?.staffNextOfKinName,
          staffQualification: deletedAcademicYear?.staffQualification
        }
      }
    ],
    new Date()
  );
  if (absoluteAdmin || hasAccess) {
    const academicYears = await fetchAcademicYears(organisation!._id.toString());

    if (!academicYears) {
      throwError("Error fetching academic years", 500);
    }
    res.status(201).json(academicYears);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view academic year - Please contact your admin", 403);
});
