import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../models/admin/accountModel.ts";
import {
  fetchUsers,
  emitToOrganisation,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  checkAccess
} from "../../utils/databaseFunctions.ts";
import { logActivity } from "../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import bcrypt from "bcryptjs";
import { StaffContract } from "../../models/staff/contracts.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../utils/pureFuctions.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
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

  const { roleId } = account as any;
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
    checkAccess(account, tabAccess, "View Users") &&
    checkAccess(account, tabAccess, "View Roles") &&
    checkAccess(account, tabAccess, "View Staff Profiles");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to view users or one of it's required data (role, staff profiles) - Please contact your admin",
      403
    );
  }

  const result = await fetchUsers(
    query,
    cursorType as string,
    parsedLimit,
    absoluteAdmin ? "Absolute Admin" : "User",
    organisation!._id.toString(),
    accountId
  );

  if (!result || !result.users) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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
});

// controller to handle role creation
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { staffId, name, email, password, status, roleId: userRoleId, uniqueTabAccess } = req.body;

  if (!staffId || !name || !email || !password) {
    throwError("Please fill all required fields", 400);
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
  const hasAccess = checkAccess(account, creatorTabAccess, " Create User");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create users - Please contact your admin", 403);
  }

  const userExists = await Account.findOne({ email: email, organisationId: organisation?._id }).lean();
  if (userExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, userExists]) }
    ]);
    throwError(
      "Another user within the organisation already uses this email - they might already have an account",
      409
    );
  }

  const staffHasActiveContract = await StaffContract.findOne({ staffId, status: "Active" }).lean();
  if (!staffHasActiveContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, userExists]) }
    ]);
    throwError(
      "This staff ID does not have an active contract. Ensure they have up to date active contract - or create one for them",
      409
    );
  }

  const hasedPassword = await bcrypt.hash(password, 10);
  const newUser = await Account.create({
    accountType: "User",
    organisationInitial: organisation?.organisationInitial,
    organisationId: organisation?._id,
    staffId: staffHasActiveContract?.staffId,
    uniqueTabAccess,
    email,
    name,
    password: hasedPassword,
    status: status,
    roleId: userRoleId ? userRoleId : null,
    searchText: generateSearchText([staffId, email, name, status])
  });

  if (!newUser) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, userExists]) }
    ]);
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
      name,
      [
        {
          kind: "N",
          rhs: {
            _id: newUser._id,
            staffId: staffHasActiveContract?.staffId,
            name,
            email,
            status,
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
        getObjectSize([newUser, userExists, staffHasActiveContract, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const { onEditUserIsAbsoluteAdmin, _id: userId, staffId, roleId: userRoleId } = body;

  let updatedDoc: any = {};

  for (const key in body) {
    if (key === "password") {
      if (body[key] !== "unchanged") {
        updatedDoc["password"] = await bcrypt.hash(body[key], 10);
      }
    } else if (key !== "onEditUserIsAbsoluteAdmin") {
      updatedDoc[key] = body[key];
    }
  }
  const { name, email, password, status, ...rest } = updatedDoc;

  updatedDoc = {
    ...rest,
    name,
    email,
    status,
    roleId: userRoleId ? userRoleId : null,
    searchText: generateSearchText([staffId, email, name, status])
  };

  if (!name || !email || !status) {
    throwError("Please fill all required fields", 400);
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit User");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit users - Please contact your admin", 403);
  }

  if (!staffId && !onEditUserIsAbsoluteAdmin) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Please provide staff ID", 400);
  }

  if (onEditUserIsAbsoluteAdmin && status !== "Active") {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Disallowed: Default Absolute Admin status cannot be changed - Locked", 403);
  }

  if (onEditUserIsAbsoluteAdmin && userRoleId !== organisation?.roleId?._id.toString()) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Disallowed: Another role cannot be assigned to the Default Absolute Admin", 403);
  }
  const userExists = await Account.findOne({ email: email, organisationId: userTokenOrgId }).lean();
  if (userId !== userExists?._id.toString() && userExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("This email is already in use within the same organisation - they might already have an account", 409);
  }

  const staffHasActiveContract = await StaffContract.findOne({ staffId }).lean();
  if (!staffHasActiveContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, userExists]) }
    ]);
    throwError(
      "No contract found for this staff ID. Ensure they have up to date active contract - or create one for them",
      409
    );
  }

  const originalUser = await Account.findById(userId, "_id name email roleId staffId status").lean();

  if (!originalUser) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, userExists, staffHasActiveContract])
      }
    ]);
    throwError("An error occured whilst getting old user data - Please ensure the user still exists", 500);
  }

  const updatedUser = await Account.findByIdAndUpdate(
    userId,
    {
      $set: updatedDoc
    },
    { new: true }
  ).lean();

  if (!updatedUser) {
    registerBillings(req, [
      { field: "databaseOperation", value: 8 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, userExists, staffHasActiveContract, originalUser])
      }
    ]);
    throwError("Error updating user", 500);
  }

  const original = {
    _id: originalUser?._id,
    staffId: staffHasActiveContract?.staffId,
    name: name,
    email: email,
    status: status,
    roleId: userRoleId,
    uniqueTabAccess: originalUser?.uniqueTabAccess
  };

  const updated = {
    _id: updatedUser?._id,
    staffId: staffHasActiveContract?.staffId,
    name: name,
    email: email,
    status: status,
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
      updatedUser?.name ?? "",
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 8 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value:
        (getObjectSize(updatedUser) +
          toNegative(getObjectSize(originalUser)) +
          (logActivityAllowed ? getObjectSize(activityLog) : 0)) *
        2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedUser, staffHasActiveContract, organisation, role, account, originalUser]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { _id, accountType, staffId, name, email, status, roleId } = req.body;

  if (!_id) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete User");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete roles - Please contact your admin", 403);
  }

  const deletedUser = await Account.findByIdAndDelete(_id).lean();

  if (!deletedUser) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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
      _id,
      name,
      [
        {
          kind: "D",
          lhs: {
            _id,
            staffId,
            name: name,
            email: email,
            status: status,
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
  const { roleId } = account as any;
  const { absoluteAdmin } = roleId;

  if (!absoluteAdmin) {
    throwError(
      "Unauthorised Action: You do not have access to update settings - Please contact your absolute admin",
      400
    );
  }

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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
      updatedAccount?.name ?? "",
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
