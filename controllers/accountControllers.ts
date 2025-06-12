import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { Account } from "../models/accountModel";
import { throwError } from "../utils/utilsFunctions";
import { Role } from "../models/roleModel";
import { generateRefreshToken, generateAccessToken } from "../utils/utilsFunctions";
import { ActivityLog } from "../models/activityLogModel";
import { diff } from "deep-diff";

const logActivity = async (
  organisationId: any,
  accountId: any,
  logAction: string,
  recordModel: string,
  recordId: any,
  recordName?: string,
  recordChange?: any,
  logDate?: Date
) => {
  const activityLog = await ActivityLog.create({
    organisationId,
    accountId,
    logAction,
    recordModel,
    recordId,
    recordName,
    recordChange,
    logDate
  });

  if (!activityLog) {
    throwError("Failed to log activity", 500);
  }

  console.log("Activity logged successfully:", JSON.stringify(activityLog));
  return activityLog;
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

  const organisationEmailExists = await Account.findOne({ accountEmail: organisationEmail });
  if (organisationEmailExists) {
    throwError(`Organization already has an account with this email: ${organisationEmail}. Please sign in.`, 409);
  }

  const hashedPassword = await bcrypt.hash(organisationPassword, 10);

  //   create initial organization account
  const orgAccount = await Account.create({
    accountType: "Organization",
    accountName: organisationName,
    accountEmail: organisationEmail,
    accountPhone: organisationPhone,
    accountPassword: hashedPassword
  });

  //   ensure the organization account was created successfully
  if (!orgAccount) {
    throwError("Failed to create organization account", 500);
  }

  // cretae an activity log for the organization account creation
  await logActivity(
    orgAccount._id,
    orgAccount._id,
    "Initial Organization Account Creation",
    "Account",
    orgAccount._id,
    orgAccount?.accountName ?? undefined,
    [
      {
        kind: "N",
        rhs: {
          _id: orgAccount._id,
          accountType: orgAccount.accountType,
          accountName: orgAccount.accountName,
          accountEmail: orgAccount.accountEmail,
          accountPhone: orgAccount.accountPhone
        }
      }
    ],
    new Date()
  );

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

  // create an activity log for the default role creation
  await logActivity(
    orgAccount._id,
    orgAccount._id,
    "Initial Organization Default Role Creation - Absolute Admin",
    "Role",
    defaultRole._id,
    defaultRole?.roleName ?? undefined,
    [
      {
        kind: "N",
        rhs: {
          _id: defaultRole._id,
          roleName: defaultRole.roleName,
          roleDescription: defaultRole.roleDescription,
          absoluteAdmin: defaultRole.absoluteAdmin
        }
      }
    ],
    new Date()
  );

  // update the organization account with the default role
  const updatedOrgAccount = await Account.findByIdAndUpdate(
    orgAccount._id,
    { roleId: defaultRole._id },
    { new: true }
  ).populate("roleId");

  if (!updatedOrgAccount) {
    throwError("Failed to update organization account with default role", 500);
  }

  // create an activity log for the organization account update with default role
  // get the updated data
  const original = {
    _id: orgAccount._id,
    accountType: orgAccount.accountType,
    accountName: orgAccount.accountName,
    accountEmail: orgAccount.accountEmail,
    accountPhone: orgAccount.accountPhone,
    roleId: ""
  };
  const updated = {
    _id: updatedOrgAccount?._id,
    accountType: updatedOrgAccount?.accountType,
    accountName: updatedOrgAccount?.accountName,
    accountEmail: updatedOrgAccount?.accountEmail,
    accountPhone: updatedOrgAccount?.accountPhone,
    roleId: updatedOrgAccount?.roleId
  };
  const difference = diff(original, updated);
  await logActivity(
    orgAccount._id,
    orgAccount._id,
    "Updating Organization Account with Default Role",
    "Account",
    updatedOrgAccount?._id,
    updatedOrgAccount?.accountName ?? undefined,
    difference,
    new Date()
  );

  const tokenPayload = {
    organisationId: updatedOrgAccount?.organisationId,
    accountId: updatedOrgAccount?._id,
    role: updatedOrgAccount?.roleId
  };
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

  const reshapedAccount = {
    ...updatedOrgAccount?.toObject(),
    accountId: updatedOrgAccount?._id
  };

  delete reshapedAccount._id;
  delete reshapedAccount.accountPassword;

  res.status(201).json(reshapedAccount);
});

export const signinAccount = asyncHandler(async (req: Request, res: Response) => {
  // get the email and password from the request body
  const { email, password } = req.body;
  if (!email || !password) {
    throwError("Please provide email and password", 400);
  }

  // find the account by email
  const account = await Account.findOne({ accountEmail: email }).populate("roleId");
  if (!account) {
    throwError("No associated account found for this email - Please contact your admin", 401);
  }

  const isMatch = await bcrypt.compare(password, account!.accountPassword ?? "");
  if (!isMatch) {
    throwError("Invalid password for associated account", 401);
  }

  // generate tokens
  const tokenPayload = {
    organisationId: account?.organisationId,
    accountId: account?._id,
    role: account?.roleId
  };
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

  const reshapedAccount = {
    ...account?.toObject(),
    accountId: account?._id
  };

  delete reshapedAccount._id;
  delete reshapedAccount.accountPassword;
  await logActivity(
    account?.organisationId,
    account?._id,
    "User Sign In",
    "Account",
    account?._id,
    account?.accountName ?? undefined,
    [],
    new Date()
  );
  res.status(200).json(reshapedAccount);
});
