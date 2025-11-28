import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../models/admin/accountModel.ts";
import {
  throwError,
  fetchUsers,
  generateSearchText,
  emitToOrganisation,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  checkAccess,
  getObjectSize,
  toNegative
} from "../../utils/utilsFunctions.ts";
import { logActivity } from "../../utils/utilsFunctions.ts";
import { diff } from "deep-diff";
import bcrypt from "bcryptjs";
import { StaffContract } from "../../models/staff/contracts.ts";
import { Staff } from "../../models/staff/profile.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { search = "", limit, cursorType, nextCursor, prevCursor, ...filters } = req.query;

  const parsedLimit = parseInt(limit as string);

  const queryOrgId = organisation!._id.toString();
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

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Users");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchUsers(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      accountId
    );

    if (!result || !result.users) {
      throwError("Error fetching staff profiles", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.users.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result.users, organisation, role, account])
      }
    ]);

    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view users - Please contact your admin", 403);
});

// controller to handle role creation
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { staffId, userName, userEmail, userPassword, userStatus, roleId: userRoleId, uniqueTabAccess } = req.body;

  if (!staffId || !userName || !userEmail || !userPassword || !userRoleId) {
    throwError("Please fill all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const userExists = await Account.findOne({ accountEmail: userEmail, organisationId: organisation?._id });
  if (userExists) {
    throwError("Another user within the organisation already uses this email", 409);
  }

  const staffExists = await Staff.findOne({ _id: staffId, organisationId: account!.organisationId!._id.toString() });
  if (!staffExists) {
    throwError(
      "This staff ID does not exist. Please provide the user staff ID related to their staff record - or create one for them",
      409
    );
  }

  const staffHasActiveContract = await StaffContract.findOne({ staffId, contractStatus: "Active" });
  if (!staffHasActiveContract) {
    throwError(
      "This staff ID does not have an active contract. Ensure they have up to date active contract - or create one for them",
      409
    );
  }

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, " Create User");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create users - Please contact your admin", 403);
  }

  const hasedPassword = await bcrypt.hash(userPassword, 10);
  const newUser = await Account.create({
    accountType: "User",
    organisationInitial: organisation?.organisationInitial,
    organisationId: organisation?._id,
    staffId: staffExists?._id,
    uniqueTabAccess,
    accountEmail: userEmail,
    accountName: userName,
    accountPassword: hasedPassword,
    accountStatus: userStatus,
    roleId: userRoleId,
    searchText: generateSearchText([staffId, userEmail, userName, userStatus])
  });

  if (!newUser) {
    throwError("Error creating role", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "User Account Creation",
      "Account",
      newUser?._id,
      userName,
      [
        {
          kind: "N",
          rhs: {
            _id: newUser._id,
            staffId: staffExists?._id,
            accountName: userName,
            accountEmail: userEmail,
            accountStatus: userStatus,
            roleId: userRoleId,
            uniqueTabAccess
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 8 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newUser) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newUser, userExists, staffExists, staffHasActiveContract, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const { onEditUserIsAbsoluteAdmin, uniqueTabAccess, _id: userId, staffId, roleId: userRoleId } = body;

  let updatedDoc: any = {};

  for (const key in body) {
    if (key === "userPassword") {
      if (body[key] !== "unchanged") {
        updatedDoc["accountPassword"] = await bcrypt.hash(body[key], 10);
      }
    } else if (key !== "onEditUserIsAbsoluteAdmin") {
      updatedDoc[key] = body[key];
    }
  }
  const { userName, userEmail, userPassword, userStatus, ...rest } = updatedDoc;

  updatedDoc = {
    ...rest,
    accountName: userName,
    accountEmail: userEmail,
    accountStatus: userStatus,
    roleId: userRoleId,
    searchText: generateSearchText([staffId, userEmail, userName, userStatus])
  };

  // console.log("originalDoc", body);
  // console.log("updatedDoc", updatedDoc);
  // throwError("test done", 400);

  if (!userName || !userEmail || !userRoleId || !userStatus) {
    throwError("Please fill all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const userExists = await Account.findOne({ accountEmail: userEmail });
  if (userExists && userExists?.organisationId.toString() !== userTokenOrgId) {
    throwError("This email is already in use - Please provide a different email", 409);
  }

  if (!staffId && !onEditUserIsAbsoluteAdmin) {
    throwError("Please provide staff ID", 400);
  }

  if (onEditUserIsAbsoluteAdmin && userStatus !== "Active") {
    throwError("Disallowed: Default Absolute Admin status cannot be changed - Locked", 403);
  }

  if (onEditUserIsAbsoluteAdmin && userRoleId !== organisation?.roleId?._id.toString()) {
    throwError("Disallowed: Another role cannot be assigned to the Default Absolute Admin", 403);
  }

  const staffExists = await Staff.findOne({ _id: staffId, organisationId: account!.organisationId!._id.toString() });
  if (!staffExists && !onEditUserIsAbsoluteAdmin) {
    throwError("Please provide the user staff ID related to their staff record - or create one for them", 409);
  }

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit User");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit users - Please contact your admin", 403);
  }

  const originalUser = await Account.findById(
    userId,
    "_id accountName accountEmail roleId staffId accountPassword accountStatus"
  );

  if (!originalUser) {
    throwError("An error occured whilst getting old user data - Please ensure the user still exists", 500);
  }

  const updatedUser = await Account.findByIdAndUpdate(
    userId,
    {
      $set: updatedDoc
    },
    { new: true }
  );

  if (!updatedUser) {
    throwError("Error updating user", 500);
  }

  const original = {
    _id: originalUser?._id,
    staffId: staffExists?._id,
    accountName: userName,
    accountEmail: userEmail,
    accountStatus: userStatus,
    roleId: userRoleId,
    uniqueTabAccess: originalUser?.uniqueTabAccess
  };

  const updated = {
    _id: updatedUser?._id,
    staffId: staffExists?._id,
    accountName: userName,
    accountEmail: userEmail,
    accountStatus: userStatus,
    roleId: userRoleId,
    uniqueTabAccess: updatedUser?.uniqueTabAccess
  };

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(original, updated);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "User Account Update",
      "Account",
      updatedUser?._id,
      updatedUser?.accountName ?? "",
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedUser, staffExists, organisation, role, account, originalUser]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
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
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  // confirm organisation

  const { roleId: creatorRoleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete User");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete roles - Please contact your admin", 403);
  }

  const deletedUser = await Account.findByIdAndDelete(accountIdToDelete);

  if (!deletedUser) {
    throwError("Error deleting user account - Please try again", 500);
  }

  const emitRoom = deletedUser?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "accounts", deletedUser, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "User Account Deletion",
      "Account",
      accountIdToDelete,
      userName,
      [
        {
          kind: "D",
          lhs: {
            _id: accountIdToDelete,
            staffId,
            accountName: userName,
            accountEmail: userEmail,
            accountStatus: userStatus,
            roleId
          }
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
      value: toNegative(getObjectSize(deletedUser) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedUser, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateOrgSettings = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const { settings } = body;

  if (!settings) {
    throwError("No settings provided - Please try again", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (!absoluteAdmin) {
    throwError(
      "Unauthorised Action: You do not have access to update settings - Please contact your absolute admin",
      400
    );
  }

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const organisationSettings = await Account.findById(userTokenOrgId, "settings");

  const updatedAccount = await Account.findByIdAndUpdate(
    userTokenOrgId,
    {
      $set: {
        settings
      }
    },
    { new: true }
  );

  if (!updatedAccount) {
    throwError("Error updating user", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Organisation Account Setting Update",
      "Account",
      updatedAccount?._id,
      updatedAccount?.accountName ?? "",
      diff(organisationSettings?.settings, updatedAccount?.settings),
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedAccount, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});
