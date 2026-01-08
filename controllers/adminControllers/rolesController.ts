import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Role } from "../../models/admin/roleModel.ts";
import {
  fetchRoles,
  emitToOrganisation,
  logActivity,
  checkOrgAndUserActiveness,
  checkAccess,
  confirmUserOrgRole
} from "../../utils/databaseFunctions.ts";

import { diff } from "deep-diff";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { throwError, toNegative, getObjectSize } from "../../utils/pureFuctions.ts";

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const { account, role, organisation } = (await confirmUserOrgRole(accountId)) as any;

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess, _id: selfRoleId } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "View Roles");

  if (absoluteAdmin || hasAccess) {
    const roles = await fetchRoles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      selfRoleId.toString()
    );

    if (!roles) {
      registerBillings(req, [
        { field: "databaseOperation", value: 3 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError("Error fetching roles", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + roles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([roles, organisation, role, account])
      }
    ]);

    res.status(201).json(roles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view roles - Please contact your admin", 403);
});

// controller to handle role creation
export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { name, description, tabAccess } = req.body;

  if (!name) {
    throwError("Please provide the role name", 400);
  }

  // confirm user
  const { account, role, organisation } = (await confirmUserOrgRole(accountId)) as any;

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess, _id: selfRoleId } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Role");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create roles - Please contact your admin", 403);
  }

  const newRole = await Role.create({
    organisationId: account?.organisationId,
    accountId: account?._id,
    name,
    description,
    tabAccess
  });

  if (!newRole) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error creating role", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Role Creation",
      "Role",
      newRole?._id,
      name,
      [
        {
          kind: "N",
          rhs: {
            _id: newRole._id,
            name: newRole.name,
            description: newRole.description,
            absoluteAdmin: newRole.absoluteAdmin
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 5 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newRole) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newRole, organisation, role, account]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
  return;
});

// controller to handle role update
export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { roleId, name, description, tabAccess } = req.body;

  if (!name) {
    throwError("Please provide the role name", 400);
  }

  // confirm user
  const { account, role, organisation } = (await confirmUserOrgRole(accountId)) as any;

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Role");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit roles - Please contact your admin", 403);
  }

  const originalRole = await Role.findById(roleId, " roleId name description tabAccess").lean();

  if (!originalRole) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("An error occured whilst getting old role data - it may have been deleted", 500);
  }

  const updatedRole = await Role.findByIdAndUpdate(
    roleId,
    {
      name,
      description,
      tabAccess
    },
    { new: true }
  )
    .populate("accountId")
    .lean();

  if (!updatedRole) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, originalRole]) }
    ]);
    throwError("Error updating role", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalRole, updatedRole);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Role Update",
      "Role",
      updatedRole?._id,
      name,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value:
        (getObjectSize(updatedRole) +
          toNegative(getObjectSize(originalRole)) +
          (logActivityAllowed ? getObjectSize(activityLog) : 0)) *
        2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedRole, organisation, role, account, originalRole]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
  return;
});

// controller to handle deleting roles
export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { _id, name, absoluteAdmin: roleAbsoluteAdmin } = req.body;

  if (!_id) {
    throwError("Unknown delete request - Please try again", 400);
  }

  if (roleAbsoluteAdmin === undefined) {
    throwError("Unknown role type - Please try again", 400);
  }

  if (roleAbsoluteAdmin) {
    throwError("Disallowd Action: This role cannot be deleted as it is the default Absolute Admin role", 403);
  }

  // confirm user
  const { account, role, organisation } = (await confirmUserOrgRole(accountId)) as any;

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Role");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete roles - Please contact your admin", 403);
  }

  const deletedRole = await Role.findByIdAndDelete(_id).lean();

  if (!deletedRole) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting role - Please try again", 500);
  }

  const emitRoom = deletedRole?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "roles", deletedRole, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Role Delete",
      "Role",
      deletedRole?._id,
      name,
      [
        {
          kind: "D",
          lhs: {
            _id: deletedRole?._id,
            name: deletedRole?.name,
            description: deletedRole?.description,
            absoluteAdmin: deletedRole?.absoluteAdmin,
            tabAccess: deletedRole?.tabAccess
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
      value: toNegative(getObjectSize(deletedRole) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedRole, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
  return;
});
