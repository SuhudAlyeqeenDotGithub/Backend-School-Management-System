import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Role } from "../../models/roleModel";
import { Account } from "../../models/accountModel";
import {
  confirmAccount,
  confirmRole,
  throwError,
  fetchUsers,
  generateSearchText,
  fetchStaffProfiles,
  userIsStaff,
  generateCustomId
} from "../../utils/utilsFunctions";
import { logActivity } from "../../utils/utilsFunctions";
import { diff } from "deep-diff";
import bcrypt from "bcryptjs";
import { Staff } from "../../models/staffModel";

declare global {
  namespace Express {
    interface Request {
      userToken?: any;
    }
  }
}

const validateStaffProfile = (staffDataParam: any) => {
  const {
    staffCustomId,
    staffImage,
    staffMiddleName,
    staffNextOfKinEmail,
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
    .filter(({ tab }: any) => tab === "Admin")[0]
    .actions.some(({ name }: any) => name === "View Staff");

  if (absoluteAdmin || hasAccess) {
    const staffProfiles = await fetchStaffProfiles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      staffId || "".toString()
    );

    if (!staffProfiles) {
      throwError("Error fetching staff profiles", 500);
    }
    res.status(201).json(staffProfiles);
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
    .filter(({ tab }: any) => tab === "Admin")[0]
    .actions.some(({ name }: any) => name === "Create Staff");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create staff - Please contact your admin", 403);
  }

  const newStaff = await Staff.create({
    ...copyBody,
    staffCustomId: staffCustomId === "" ? generateCustomId(["STF", accountName.trim().slice(0, 4)]) : staffCustomId,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      staffFirstName,
      staffGender,
      staffMiddleName,
      staffLastName,
      staffEmail,
      staffDateOfBirth,
      staffNationality,
      staffNextOfKinName,
      staffCustomId,
      staffQualification.qualificationName
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

  if (absoluteAdmin || hasAccess) {
    const staffProfiles = await fetchStaffProfiles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      staffId || "".toString()
    );

    if (!staffProfiles) {
      throwError("Error fetching staff profiles", 500);
    }
    res.status(201).json(staffProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view staff profile - Please contact your admin", 403);
});

// controller to handle role update
export const updateStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const {
    onEditUserIsAbsoluteAdmin,
    userId,
    staffId,
    userName,
    userEmail,
    userPassword,
    userStatus,
    roleId: userRoleId,
    passwordChanged
  } = req.body;

  if (passwordChanged === undefined || passwordChanged === null) {
    throwError("Unknown Error with password state", 400);
  }

  if (!userName || !userEmail || !userPassword || !userRoleId || !userStatus) {
    throwError("Please fill all required fields", 400);
  }

  // confirm user
  const account = await confirmAccount(accountId);
  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  if (!staffId && !onEditUserIsAbsoluteAdmin) {
    throwError("Please provide staff ID", 400);
  }

  if (onEditUserIsAbsoluteAdmin && userStatus !== "Active") {
    throwError("Disallowed: Default Absolute Admin status cannot be changed - Locked", 403);
  }

  if (onEditUserIsAbsoluteAdmin && userRoleId !== organisation?.roleId?._id.toString()) {
    throwError("Disallowed: Another role cannot be assigned to the Default Absolute Admin", 403);
  }

  const staffExists = await Staff.findById(staffId);
  if (staffExists) {
    throwError("Please provide the user staff ID related to their staff record - or create one for them", 409);
  }

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab }: any) => tab === "Admin")[0]
    .actions.some(({ name }: any) => name === "dit User");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit users - Please contact your admin", 403);
  }

  const originalUser = await Account.findById(
    userId,
    "_id accountName accountEmail roleId staffId accountPassword accountStatus"
  );

  if (!originalUser) {
    throwError("An error occured whilst getting old user data", 500);
  }

  let updatedUser;

  if (userPassword === "Change01@Password123?") {
    throwError("Change01@Password123? cannot be used for password as it is reserved", 400);
  }

  if (!passwordChanged) {
    updatedUser = await Account.findByIdAndUpdate(userId, {
      staffId,
      accountName: userName,
      accountEmail: userEmail,
      accountPassword: userPassword,
      accountStatus: userStatus,
      roleId: userRoleId,
      searchText: generateSearchText([staffId, userEmail, userName, userStatus])
    });
  }
  if (passwordChanged) {
    const hasedPassword = await bcrypt.hash(userPassword, 10);
    console.log("original new password is", userPassword);
    console.log("hashed new password is", hasedPassword);
    if (hasedPassword) {
      updatedUser = await Account.findByIdAndUpdate(userId, {
        staffId,
        accountName: userName,
        accountEmail: userEmail,
        accountPassword: hasedPassword,
        accountStatus: userStatus,
        roleId: userRoleId,
        searchText: generateSearchText([staffId, userEmail, userName, userStatus])
      });
    }
  }

  if (!updatedUser) {
    throwError("Error updating user", 500);
  }

  const original = originalUser;

  const updated = {
    _id: updatedUser?._id,
    staffId: updatedUser?.staffId,
    accountName: updatedUser?.accountName,
    accountEmail: updatedUser?.accountEmail,
    accountPassword: updatedUser?.accountPassword,
    accountStatus: updatedUser?.accountStatus,
    roleId: updatedUser?.roleId
  };
  const difference = diff(original, updated);

  await logActivity(
    account?.organisationId,
    accountId,
    "User Update",
    "Account",
    updatedUser?._id,
    updatedUser?.accountName ?? "",
    difference,
    new Date()
  );

  if (absoluteAdmin || hasAccess) {
    const users = await fetchUsers(absoluteAdmin ? "Absolute Admin" : "User", organisation!._id.toString(), accountId);

    if (!users) {
      throwError("Error fetching users", 500);
    }
    res.status(201).json(users);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view roles - Please contact your admin", 403);
});

// controller to handle deleting roles
export const deleteStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { accountIdToDelete, accountType, staffId, userName, userEmail, userStatus, roleId } = req.body;

  if (!accountIdToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }

  if (roleId.absoluteAdmin === undefined) {
    throwError("Unknown role type - Please try again", 400);
  }

  if (roleId.absoluteAdmin || accountType === "Organization") {
    throwError(
      "Disallowd Action: This account cannot be deleted as it is the default Absolute Admin/organisation account",
      403
    );
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
    .filter(({ tab, actions }: any) => tab === "Admin")[0]
    .actions.some(({ name, permission }: any) => name === "Delete User");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete roles - Please contact your admin", 403);
  }

  const deletedUser = await Account.findByIdAndDelete(accountIdToDelete);

  if (!deletedUser) {
    throwError("Error deleting user account - Please try again", 500);
  }

  const original = {
    accountId: accountIdToDelete,
    staffId,
    accountName: userName,
    accountEmail: userEmail,
    accountStatus: userStatus,
    roleId
  };

  const updated = {};
  const difference = diff(original, updated);
  await logActivity(
    account?.organisationId,
    accountId,
    "User Delete",
    "Account",
    accountIdToDelete,
    userName,
    difference,
    new Date()
  );

  if (absoluteAdmin || hasAccess) {
    const users = await fetchUsers(absoluteAdmin ? "Absolute Admin" : "User", organisation!._id.toString(), accountId);

    if (!users) {
      throwError("Error fetching users", 500);
    }
    res.status(201).json(users);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view roles - Please contact your admin", 403);
});
