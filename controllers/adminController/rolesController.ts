import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Role } from "../../models/roleModel";
import { Account } from "../../models/accountModel";
import { confirmAccount, confirmRole, throwError } from "../../utils/utilsFunctions";
import { logActivity } from "../../utils/utilsFunctions";

declare global {
  namespace Express {
    interface Request {
      userToken?: any;
    }
  }
}
export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const account = await confirmAccount(accountId);

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  // confirm role
  const role = await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  if (accountStatus === "Locked") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const roles = await Role.find({ organisationId: organisation!._id }).populate("accountId");

  if (!roles) {
    throwError("Error fetching roles", 500);
  }

  // tabAccess = [{ tab: "Admin", actions: [{ name: "Create Role", permission: false }] }];
  const hasAccess = tabAccess
    .filter(({ tab, actions }: any) => tab === "Admin")[0]
    .actions.some(({ name, permission }: any) => name === "View Role");

  if (absoluteAdmin || hasAccess) {
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
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (accountStatus === "Locked") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const newRole = Role.create({
    organisationId: account?.organisationId,
    accountId: account?._id,
    roleName,
    roleDescription,
    tabAccess
  });

  if (!newRole) {
    throwError("Error creating role", 500);
  }
  const roles = await Role.find({ organisationId: organisation!._id }).populate("accountId");

  if (!roles) {
    throwError("Error fetching roles", 500);
  }

  // tabAccess = [{ tab: "Admin", actions: [{ name: "Create Role", permission: false }] }];
  const hasAccess = creatorTabAccess
    .filter(({ tab, actions }: any) => tab === "Admin")[0]
    .actions.some(({ name, permission }: any) => name === "Create Role");

  if (absoluteAdmin || hasAccess) {
    res.status(201).json(roles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to create roles - Please contact your admin", 403);
});
