import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { OrgAccount } from "../models/accountModel";
import { throwError } from "../utils/utilsFunctions";
import { Role } from "../models/roleModel";
import { generateRefreshToken, generateAccessToken } from "../utils/utilsFunctions";
import { ActivityLog } from "../models/activityLogModel";

const fetchOrgAccountData = async (orgId: any) => {
  const orgAccount_RoleData = await OrgAccount.find({ _id: orgId }).populate("roleData");
  if (!orgAccount_RoleData) {
    throwError("Error fetching organization account data", 500);
  }
  return orgAccount_RoleData;
};
export const signupOrgAccount = asyncHandler(async (req: Request, res: Response) => {
  const { organisationName, organisationEmail, organisationPhone, organisationPassword, organisationConfirmPassword } =
    req.body;

  if (
    !organisationName ||
    !organisationEmail ||
    !organisationPhone ||
    !organisationPassword ||
    !organisationConfirmPassword
  ) {
    throwError("Please provide all required fields", 400);
  }

  if (organisationPassword !== organisationConfirmPassword) {
    throwError("Passwords does not match", 400);
  }

  const organisationEmailExists = await OrgAccount.findOne({ organisationEmail });
  if (organisationEmailExists) {
    throwError(`Organization already has an account with this email: ${organisationEmail}. Please sign in.`, 409);
  }

  const hashedPassword = await bcrypt.hash(organisationPassword, 10);

  //   create initial organization account
  const orgAccount = await OrgAccount.create({
    organisationName,
    organisationEmail,
    organisationPhone,
    organisationPassword: hashedPassword
  });

  //   ensure the organization account was created successfully
  if (!orgAccount) {
    throwError("Failed to create organization account", 500);
  }

  //   create a default role for the organization as absolute admin
  const defaultRole = await Role.create({
    organisationId: orgAccount._id,
    roleName: "Absolute Admin",
    roleDescription: "This is the default role for the organization, it has all permissions",
    absoluteAdmin: true
  });

  //   ensure the default role was created successfully
  if (!defaultRole) {
    throwError("Failed to create default role for organization", 500);
  }

  // update the organization account with the default role
  const updatedOrgAccount = await OrgAccount.findByIdAndUpdate(
    orgAccount._id,
    { roleId: defaultRole._id },
    { new: true }
  );

  if (!updatedOrgAccount) {
    throwError("Failed to update organization account with default role", 500);
  }

  const tokenPayload = {
    organisationId: defaultRole.organisationId,
    roleName: defaultRole.roleName,
    roleId: defaultRole._id,
    absoluteAdmin: defaultRole.absoluteAdmin,
    tabAccess: defaultRole.tabAccess
  };

  console.log("Token Payload:", tokenPayload);

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 24 * 60 * 60 * 1000,
    sameSite: "lax"
  });

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 1000,
    sameSite: "lax"
  });

  const accountData = { ...updatedOrgAccount, roleData: defaultRole };

  res.status(201).json(accountData);
});

export const signinOrgAccount = asyncHandler(async (req: Request, res: Response) => {});
