import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Role } from "../../models/admin/roleModel.ts";
import {
  confirmAccount,
  confirmRole,
  throwError,
  fetchRoles,
  emitToOrganisation,
  logActivity
} from "../../utils/utilsFunctions.ts";

import { diff } from "deep-diff";

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const account = await confirmAccount(accountId);

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  // confirm role
  const role = await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess, _id: selfRoleId } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = tabAccess
    .filter(({ tab, actions }: any) => tab === "Admin")[0]
    .actions.some(({ name, permission }: any) => name === "View Roles" && permission === true);

  if (absoluteAdmin || hasAccess) {
    const roles = await fetchRoles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      selfRoleId.toString()
    );

    if (!roles) {
      throwError("Error fetching roles", 500);
    }
    res.status(201).json(roles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view roles - Please contact your admin", 403);
});

// controller to handle role creation
export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { roleName, roleDescription, tabAccess } = req.body;

  if (!roleName) {
    throwError("Please provide the role name", 400);
  }

  // confirm user
  const account = await confirmAccount(accountId);

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess, _id: selfRoleId } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }
  const hasAccess = creatorTabAccess
    .filter(({ tab, actions }: any) => tab === "Admin")[0]
    .actions.some(({ name, permission }: any) => name === "Create Role" && permission === true);

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create roles - Please contact your admin", 403);
  }

  const newRole = await Role.create({
    organisationId: account?.organisationId,
    accountId: account?._id,
    roleName,
    roleDescription,
    tabAccess
  });

  if (!newRole) {
    throwError("Error creating role", 500);
  }

  await logActivity(
    account?.organisationId,
    accountId,
    "Role Creation",
    "Role",
    newRole?._id,
    roleName,
    [
      {
        kind: "N",
        rhs: {
          _id: newRole._id,
          roleName: newRole.roleName,
          roleDescription: newRole.roleDescription,
          absoluteAdmin: newRole.absoluteAdmin
        }
      }
    ],
    new Date()
  );

  if (absoluteAdmin || hasAccess) {
    const roles = await fetchRoles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      selfRoleId.toString()
    );

    if (!roles) {
      throwError("Error fetching roles", 500);
    }
    res.status(201).json(roles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view roles - Please contact your admin", 403);
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
  const { absoluteAdmin, tabAccess: creatorTabAccess, _id: selfRoleId } = creatorRoleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab, actions }: any) => tab === "Admin")[0]
    .actions.some(({ name, permission }: any) => name === "Edit Role" && permission === true);

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit roles - Please contact your admin", 403);
  }

  const originalRole = await Role.findById(roleId, " roleId roleName roleDescription tabAccess");

  if (!originalRole) {
    throwError("An error occured whilst getting old role data - it may have been deleted", 500);
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
    roleId: originalRole?._id,
    roleName: originalRole?.roleName,
    roleDescription: originalRole?.roleDescription,
    tabAccess: originalRole?.tabAccess
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
    const roles = await fetchRoles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      selfRoleId.toString()
    );

    if (!roles) {
      throwError("Error fetching roles", 500);
    }
    res.status(201).json(roles);
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
  const { absoluteAdmin, tabAccess: creatorTabAccess, _id: selfRoleId } = creatorRoleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab, actions }: any) => tab === "Admin")[0]
    .actions.some(({ name, permission }: any) => name === "Delete Role" && permission === true);

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete roles - Please contact your admin", 403);
  }

  const originalRole = await Role.findById(roleIdToDelete, " roleId roleName roleDescription tabAccess");

  if (!originalRole) {
    throwError("An error occured whilst getting old role data - it may have been deleted", 500);
  }

  const deletedRole = await Role.findByIdAndDelete(roleIdToDelete);

  if (!deletedRole) {
    throwError("Error deleting role - Please try again", 500);
  }

  const emitRoom = deletedRole?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "roles", deletedRole, "delete");

  await logActivity(
    account?.organisationId,
    accountId,
    "Role Delete",
    "Role",
    deletedRole?._id,
    roleName,
    [
      {
        kind: "D",
        lhs: {
          _id: originalRole?._id,
          roleName: originalRole?.roleName,
          roleDescription: originalRole?.roleDescription,
          absoluteAdmin: originalRole?.absoluteAdmin,
          tabAccess: originalRole?.tabAccess
        }
      }
    ],
    new Date()
  );

  if (absoluteAdmin || hasAccess) {
    const roles = await fetchRoles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      selfRoleId.toString()
    );

    if (!roles) {
      throwError("Error fetching roles", 500);
    }
    res.status(201).json(roles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view roles - Please contact your admin", 403);
});
