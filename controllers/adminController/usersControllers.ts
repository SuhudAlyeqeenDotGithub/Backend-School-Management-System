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
    const users = await fetchUsers(absoluteAdmin ? "Absolute Admin" : "User", organisation!._id.toString());

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

  if (!userName || !userEmail || !userPassword || !userRoleId) {
    throwError("Please fill all required fields", 400);
  }

  const userExists = await Account.findOne({ accountEmail: userEmail });
  if (userExists) {
    throwError("This user already exist - Please sign in", 409);
  }

  const staffExists = await Staff.findById(staffId);
  if (!staffExists) {
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
    .actions.some(({ name }: any) => name === "Create Role");

  if (!absoluteAdmin || !hasAccess) {
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
    const users = await fetchUsers(absoluteAdmin ? "Absolute Admin" : "User", organisation!._id.toString());

    if (!users) {
      throwError("Error fetching users", 500);
    }
    res.status(201).json(users);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view users - Please contact your admin", 403);
});

// controller to handle role update
export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { roleId, roleName, roleDescription, tabAccess } = req.body;

  if (!roleName) {
    throwError("Please provide the role name", 400);
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
    .actions.some(({ name, permission }: any) => name === "Edit Role");

  if (!absoluteAdmin || !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit users - Please contact your admin", 403);
  }

  const updatedRole = await Role.findByIdAndUpdate(
    roleId,
    {
      roleName,
      roleDescription,
      tabAccess
    },
    { new: true }
  ).populate("accountId");

  if (!updatedRole) {
    throwError("Error updating role", 500);
  }

  const original = {
    roleId,
    roleName,
    roleDescription,
    tabAccess
  };

  const updated = {
    roleId: updatedRole?._id,
    roleName: updatedRole?.roleName,
    roleDescription: updatedRole?.roleDescription,
    tabAccess: updatedRole?.tabAccess
  };
  const difference = diff(original, updated);
  await logActivity(
    account?.organisationId,
    accountId,
    "Role Update",
    "Role",
    updatedRole?._id,
    roleName,
    difference,
    new Date()
  );

  if (absoluteAdmin || hasAccess) {
    const users = await fetchUsers(absoluteAdmin ? "Absolute Admin" : "User", organisation!._id.toString());

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

  if (!absoluteAdmin || !hasAccess) {
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
    const roles = await fetchUsers(absoluteAdmin ? "Absolute Admin" : "User", organisation!._id.toString());

    if (!roles) {
      throwError("Error fetching roles", 500);
    }
    res.status(201).json(roles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view roles - Please contact your admin", 403);
});
