import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Role } from "../../models/roleModel";
import { Account } from "../../models/accountModel";
import { confirmAccount, confirmRole, throwError, fetchUsers, generateSearchText } from "../../utils/utilsFunctions";
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
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const account = await confirmAccount(accountId);

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  // confirm role
  const role = await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = tabAccess
    .filter(({ tab }: any) => tab === "Admin")[0]
    .actions.some(({ name }: any) => name === "View Users");

  if (absoluteAdmin || hasAccess) {
    const users = await fetchUsers(absoluteAdmin ? "Absolute Admin" : "User", organisation!._id.toString(), accountId);

    if (!users) {
      throwError("Error fetching users", 500);
    }
    res.status(201).json(users);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view users - Please contact your admin", 403);
});

// controller to handle role creation
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { staffId, userName, userEmail, userPassword, userStatus, roleId: userRoleId } = req.body;

  if (!staffId || !userName || !userEmail || !userPassword || !userRoleId) {
    throwError("Please fill all required fields", 400);
  }

  const userExists = await Account.findOne({ accountEmail: userEmail });
  if (userExists) {
    throwError("This user already exist - Please sign in", 409);
  }

  const staffExists = await Staff.findById(staffId);
  if (staffExists) {
    throwError("Please provide the user staff ID related to their staff record - or create one for them", 409);
  }

  // confirm user
  const account = await confirmAccount(accountId);

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab }: any) => tab === "Admin")[0]
    .actions.some(({ name }: any) => name === "Create User");
  console.log("hasAccess", hasAccess);

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create users - Please contact your admin", 403);
  }

  const hasedPassword = await bcrypt.hash(userPassword, 10);
  const newUser = await Account.create({
    accountType: "User",
    organisationId: organisation?._id,
    staffId,
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

  await logActivity(
    account?.organisationId,
    accountId,
    "User Creation",
    "Account",
    newUser?._id,
    userName,
    [
      {
        kind: "N",
        rhs: {
          _id: newUser._id,
          staffId,
          accountName: userName,
          accountEmail: userEmail,
          accountStatus: userStatus,
          roleId: userRoleId
        }
      }
    ],
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

  throwError("Unauthorised Action: You do not have access to view users - Please contact your admin", 403);
});

// controller to handle role update
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { userId, staffId, userName, userEmail, userPassword, userStatus, roleId: userRoleId } = req.body;

  if (!userName || !userEmail || !userPassword || !userRoleId || !userStatus) {
    throwError("Please fill all required fields", 400);
  }

  // confirm user
  const account = await confirmAccount(accountId);
  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (!staffId && !absoluteAdmin) {
    throwError("Please provide staff ID", 400);
  }

  const staffExists = await Staff.findById(staffId);
  if (staffExists) {
    throwError("Please provide the user staff ID related to their staff record - or create one for them", 409);
  }

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab }: any) => tab === "Admin")[0]
    .actions.some(({ name }: any) => name === "dit User");
  console.log("hasAccess", hasAccess);

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

  const noPasswordChange = await bcrypt.compare(userPassword, originalUser!.accountPassword);

  if (noPasswordChange) {
    updatedUser = await Account.findByIdAndUpdate(userId, {
      staffId,
      accountName: userName,
      accountEmail: userEmail,
      accountPassword: userPassword,
      accountStatus: userStatus,
      roleId: userRoleId,
      searchText: generateSearchText([staffId, userEmail, userName, userStatus])
    });
  } else {
    const hasedPassword = await bcrypt.hash(userPassword, 10);
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
export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { roleIdToDelete, roleName, roleDescription, absoluteAdmin: roleAbsoluteAdmin, tabAccess } = req.body;

  if (!roleIdToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }

  if (roleAbsoluteAdmin === undefined) {
    throwError("Unknown role type - Please try again", 400);
  }

  if (roleAbsoluteAdmin) {
    throwError("Disallowd Action: This role cannot be deleted as it is the default Absolute Admin role", 403);
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
    .actions.some(({ name, permission }: any) => name === "Delete Role");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete roles - Please contact your admin", 403);
  }

  const deletedRole = await Role.findByIdAndDelete(roleIdToDelete);

  if (!deletedRole) {
    throwError("Error deleting role - Please try again", 500);
  }

  const original = {
    roleIdToDelete,
    roleName,
    roleDescription,
    tabAccess
  };

  const updated = {
    roleId: deletedRole?._id,
    roleName: deletedRole?.roleName,
    roleDescription: deletedRole?.roleDescription,
    tabAccess: deletedRole?.tabAccess
  };
  const difference = diff(original, updated);
  await logActivity(
    account?.organisationId,
    accountId,
    "Role Delete",
    "Role",
    deletedRole?._id,
    roleName,
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
