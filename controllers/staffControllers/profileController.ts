import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../models/admin/accountModel.ts";
import {
  getObjectSize,
  toNegative,
  throwError,
  generateSearchText,
  fetchStaffProfiles,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllStaffProfiles,
  validateEmail,
  validatePhoneNumber
} from "../../utils/utilsFunctions.ts";
import { logActivity } from "../../utils/utilsFunctions.ts";
import { diff } from "deep-diff";

import { Staff } from "../../models/staff/profile.ts";
import { registerBillings } from "utils/billingFunctions.ts";

const validateStaffProfile = (staffDataParam: any) => {
  const {
    staffImageUrl,
    imageLocalDestination,
    staffQualification,
    workExperience,
    identification,
    skills,
    staffPostCode,
    staffEndDate,
    ...copyLocalData
  } = staffDataParam;

  if (!validateEmail(staffDataParam.staffEmail)) {
    throwError("Please enter a valid email address.", 400);
    return;
  }

  if (!validatePhoneNumber(staffDataParam.staffPhone)) {
    throwError("Please enter a valid phone number with the country code. e.g +234, +447", 400);
    return;
  }

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllStaffProfiles = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Staff Profiles");

  if (absoluteAdmin || hasAccess) {
    const staffProfiles = await fetchAllStaffProfiles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      absoluteAdmin ? "" : staffId.staffCustomId.toString()
    );

    if (!staffProfiles) {
      throwError("Error fetching staff profiles", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + staffProfiles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([staffProfiles, organisation, role, account])
      }
    ]);
    res.status(201).json(staffProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view staff profile - Please contact your admin", 403);
});

export const getStaffProfiles = asyncHandler(async (req: Request, res: Response) => {
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

  const hasAccess = checkAccess(account, tabAccess, "View Staff Profiles");

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

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.staffProfiles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view staff profile - Please contact your admin", 403);
});

// controller to handle role creation
export const createStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const {
    staffCustomId,
    staffFullName,
    staffDateOfBirth,
    staffGender,
    staffEmail,
    staffNationality,
    staffNextOfKinName
  } = body;

  if (!validateStaffProfile(body)) {
    throwError("Please fill in all required fields", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Staff Profile");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create staff - Please contact your admin", 403);
  }

  const usedEmail = await Account.findOne({ staffEmail, organisationId: orgParsedId });
  if (usedEmail) {
    throwError("This email is already in use by another staff member - Please use a different email", 409);
  }

  const staffExists = await Staff.findOne({ organisationId: orgParsedId, staffCustomId });
  if (staffExists) {
    throwError(
      "A staff with this Custom Id already exist - Either refer to that record or change the staff custom Id",
      409
    );
  }

  const newStaff = await Staff.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      staffCustomId,
      staffFullName,
      staffGender,
      staffEmail,
      staffDateOfBirth,
      staffNationality,
      staffNextOfKinName
    ])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Staff Profile Creation",
      "Staff",
      newStaff?._id,
      staffFullName,
      [
        {
          kind: "N",
          rhs: {
            _id: newStaff._id,
            staffId: newStaff.staffCustomId,
            staffFullName
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newStaff) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newStaff, usedEmail, staffExists, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const {
    staffCustomId,
    staffFullName,
    staffDateOfBirth,
    staffGender,
    staffEmail,
    staffNationality,
    staffNextOfKinName
  } = body;

  if (!validateStaffProfile(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Staff Profile");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit staff - Please contact your admin", 403);
  }

  const originalStaff = await Staff.findOne({ organisationId: orgParsedId, staffCustomId });

  if (!originalStaff) {
    throwError("An error occured whilst getting old staff data", 500);
  }

  const updatedStaff = await Staff.findByIdAndUpdate(
    originalStaff?._id.toString(),
    {
      ...body,
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

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalStaff, updatedStaff);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Staff Profile Update",
      "Staff",
      updatedStaff?._id,
      staffFullName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedStaff, organisation, role, account, originalStaff]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { staffIDToDelete } = req.body;
  if (!staffIDToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Staff Profile");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete staff profile - Please contact your admin", 403);
  }

  const staffProfileToDelete = await Staff.findOne({
    organisationId: organisation?._id.toString(),
    staffCustomId: staffIDToDelete
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

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
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
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 6 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: toNegative(getObjectSize(deletedStaffProfile) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedStaffProfile, organisation, role, account, staffProfileToDelete]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
