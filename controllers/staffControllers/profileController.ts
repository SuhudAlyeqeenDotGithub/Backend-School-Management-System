import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../models/admin/accountModel.ts";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchStaffProfiles,
  userIsStaff,
  generateCustomId,
  emitToOrganisation
} from "../../utils/utilsFunctions.ts";
import { logActivity } from "../../utils/utilsFunctions.ts";
import { diff } from "deep-diff";

import { Staff } from "../../models/staff/profile.ts";

const validateStaffProfile = (staffDataParam: any) => {
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

export const getStaffProfiles = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { search = "", limit = 15, cursorType = "next", nextCursor, prevCursor, ...filters } = req.query;

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
    .filter(({ tab }: any) => tab === "Staff")[0]
    .actions.some(({ name }: any) => name === "View Staff");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchStaffProfiles(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      absoluteAdmin ? "" : staffId.staffCustomId.toString()
    );

    if (!result || !result.staffProfiles) {
      throwError("Error fetching staff profiles", 500);
    }
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view staff profile - Please contact your admin", 403);
});

// controller to handle role creation
export const createStaffProfile = asyncHandler(async (req: Request, res: Response) => {
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

  if (!validateStaffProfile(copyBody)) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const account = await confirmAccount(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const organisation = await confirmAccount(orgParsedId);

  const usedEmail = await Account.findOne({ staffEmail, organisationId: orgParsedId });
  if (usedEmail) {
    throwError("This email is already in use by another staff member - Please use a different email", 409);
  }

  const staffExists = await userIsStaff(staffCustomId, orgParsedId);
  if (staffExists) {
    throwError(
      "A staff with this Custom Id already exist - Either refer to that record or change the staff custom Id",
      409
    );
  }

  const { roleId, accountStatus, accountName, staffId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab }: any) => tab === "Staff")[0]
    .actions.some(({ name, permission }: any) => name === "Create Staff" && permission === true);

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create staff - Please contact your admin", 403);
  }

  const newStaff = await Staff.create({
    ...copyBody,
    staffCustomId: staffCustomId === "" ? generateCustomId("STF" + organisation!.organisationInitial) : staffCustomId,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      staffCustomId,
      staffFirstName,
      staffGender,
      staffMiddleName,
      staffLastName,
      staffEmail,
      staffDateOfBirth,
      staffNationality,
      staffNextOfKinName
    ])
  });

  await logActivity(
    account?.organisationId,
    accountId,
    "Staff Profile Creation",
    "Staff",
    newStaff?._id,
    staffFirstName + " " + staffLastName,
    [
      {
        kind: "N",
        rhs: {
          _id: newStaff._id,
          staffId: newStaff.staffCustomId,
          staffFullName: staffFirstName + " " + staffLastName
        }
      }
    ],
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const {
    staffCustomId,
    staffFullName,
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
    staffFullName,
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

  if (!validateStaffProfile(copyBody)) {
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
        staffGender,
        staffFullName,
        staffEmail,
        staffDateOfBirth,
        staffNationality,
        staffNextOfKinName
      ])
    },
    { new: true }
  );

  if (!updatedStaff) {
    throwError("Error updating staff profile", 500);
  }

  const difference = diff(originalStaff, updatedStaff);

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

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteStaffProfile = asyncHandler(async (req: Request, res: Response) => {
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
    throwError("Unauthorised Action: You do not have access to delete staff profile - Please contact your admin", 403);
  }

  const staffProfileToDelete = await Staff.findOne({
    staffCustomId: staffIDToDelete,
    organisationId: organisation?._id.toString()
  });

  if (!staffProfileToDelete) {
    throwError("Error finding staff profile with provided Custom Id - Please try again", 404);
  }

  const deletedStaffProfile = await Staff.findByIdAndDelete(staffProfileToDelete?._id.toString());
  if (!deletedStaffProfile) {
    throwError("Error deleting staff profile - Please try again", 500);
  }

  const emitRoom = deletedStaffProfile?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "staffs", deletedStaffProfile, "delete");

  await logActivity(
    account?.organisationId,
    accountId,
    "Staff Delete",
    "Staff",
    deletedStaffProfile?._id,
    deletedStaffProfile?.staffFullName,
    [
      {
        kind: "D" as any,
        lhs: {
          _id: deletedStaffProfile?._id,
          staffCustomId: deletedStaffProfile?.staffCustomId,
          staffFullName: deletedStaffProfile?.staffFullName,
          staffEmail: deletedStaffProfile?.staffEmail,
          staffNextOfKinName: deletedStaffProfile?.staffNextOfKinName,
          staffQualification: deletedStaffProfile?.staffQualification
        }
      }
    ],
    new Date()
  );
  res.status(201).json("successfull");
});
