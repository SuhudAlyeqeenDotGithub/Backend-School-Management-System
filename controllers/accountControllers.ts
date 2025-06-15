import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { Account } from "../models/accountModel";
import { throwError } from "../utils/utilsFunctions";
import { Role } from "../models/roleModel";
import { generateRefreshToken, generateAccessToken } from "../utils/utilsFunctions";
import { ActivityLog } from "../models/activityLogModel";
import { diff } from "deep-diff";
import { ResetPassword } from "../models/resetPasswordModel";
import crypto from "crypto";
import nodemailer from "nodemailer";

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
    roleName: `Absolute Admin for organization (${organisationName})`,
    roleDescription: `This is the default role for the organization (${organisationName}), it has all permissions`,
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
    `Initial Default Role Creation for organization (${organisationName}) - Absolute Admin`,
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
    `Updating organization (${organisationName}) Account with Default Role`,
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
    throwError(`No associated account found for email (${email}) - Please contact your admin.`, 401);
  }

  const isMatch = await bcrypt.compare(password, account!.accountPassword ?? "");
  if (!isMatch) {
    throwError("Incorrect password for associated account", 401);
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

export const resetPasswordSendEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    throwError("Please provide the associated email", 400);
  }

  const accountExist = await Account.findOne({ accountEmail: email });
  if (!accountExist) {
    throwError("Unknown Email. Please sign up if you have no existing account", 409);
  }

  const resetCode = crypto.randomBytes(32).toString("hex");
  const hashedResetCode = crypto.createHash("sha256").update(resetCode).digest("hex");

  const resetPasswordDoc = await ResetPassword.create({
    accountEmail: email,
    resetCode: hashedResetCode,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });

  if (!resetPasswordDoc) {
    throwError("Error reset password", 500);
  }

  // create a log for reset password request
  await logActivity(
    accountExist?._id,
    accountExist?._id,
    "Reset Password Request",
    "None",
    resetPasswordDoc._id,
    "Reset Password",
    [],
    new Date()
  );

  // send token to account email
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD
    }
  });

  const mailOptions = {
    from: process.env.EMAIL, // still your email
    to: email, // send to user
    subject: "Reset Password Verification Code - From Al-Yeqeen School Management App",
    text: `Hello ${accountExist?.accountName}, your code is: ${resetCode}. Please do not share this with anyone and use within 8 minutes`
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error: any) {
    throwError(error.message || "Error sending code", 500);
  }

  res.status(200).json({ message: `A verification code has been sent to email ${email}. You will now be redirected` });
});

export const resetPasswordVerifyCode = asyncHandler(async (req: Request, res: Response) => {
  const { code, email } = req.body;

  if (!code) {
    throwError("Please provide the code you received", 400);
  }
  if (!email) {
    throwError(
      "Sorry!!! we lost track of the associated email. Please Ensure you are using the same browser or resend code",
      400
    );
  }

  const resetPasswordDoc = await ResetPassword.findOne({ accountEmail: email });
  if (!resetPasswordDoc) {
    throwError("No code has been sent to this email in the last 15 minutes. Please resend code", 409);
  }

  const { resetCode, expiresAt } = resetPasswordDoc as {
    resetCode: string;
    expiresAt: Date;
  };

  const hashedResetCode = crypto.createHash("sha256").update(code).digest("hex");
  if (hashedResetCode !== resetCode) {
    await ResetPassword.deleteOne({ resetCode: hashedResetCode });
    throwError(`Please use the latest code that was sent to ${email}`, 400);
  }

  if (expiresAt < new Date()) {
    await ResetPassword.deleteOne({ resetCode: hashedResetCode });
    throwError(`This code is expired. Please request a new one`, 409);
  }

  res.status(200).json({ message: `Code verification successful. You will now be redirected` });
});

export const resetPasswordNewPassword = asyncHandler(async (req: Request, res: Response) => {
  const { organisationEmail, organisationPassword, organisationConfirmPassword, code } = req.body;

  if (!organisationEmail || !organisationPassword || !organisationConfirmPassword) {
    throwError("Please provide all required fields", 400);
  }

  if (organisationPassword !== organisationConfirmPassword) {
    throwError("Passwords does not match", 400);
  }

  const organisationEmailExists = await Account.findOne({ accountEmail: organisationEmail });
  if (!organisationEmailExists) {
    throwError(`Organization with email ${organisationEmail} does not exist. Please sign up`, 409);
  }
  if (!code) {
    throwError(
      "Sorry!!! we lost track of the associated code for this session. Please Ensure you are using the same browser or resend code",
      400
    );
  }

  const resetPasswordDoc = await ResetPassword.findOne({ accountEmail: organisationEmail });
  if (!resetPasswordDoc) {
    throwError("Invalid request. Please request a code to reset password", 409);
  }

  const { resetCode, expiresAt } = resetPasswordDoc as {
    resetCode: string;
    expiresAt: Date;
  };

  const hashedResetCode = crypto.createHash("sha256").update(code).digest("hex");
  if (hashedResetCode !== resetCode) {
    await ResetPassword.deleteOne({ resetCode: hashedResetCode });
    throwError(`Invalid code, Please request a new one`, 400);
  }

  if (expiresAt < new Date()) {
    await ResetPassword.deleteOne({ resetCode: hashedResetCode });
    throwError(`Associated code for this session is expired. Please request a new one`, 409);
  }

  const hashedPassword = await bcrypt.hash(organisationPassword, 10);

  const updatedAccountPassword = await Account.findByIdAndUpdate(
    organisationEmailExists?._id,
    { accountPassword: hashedPassword },
    { new: true }
  ).populate("roleId");

  if (!updatedAccountPassword) {
    throwError("Failed to change password", 500);
  }

  // cretae an activity log for the organization account password change
  // get the difference in old and new
  const difference = diff(organisationEmailExists, updatedAccountPassword);
  await logActivity(
    updatedAccountPassword?._id,
    updatedAccountPassword?._id,
    `Changing organisation ${updatedAccountPassword?.accountName} password`,
    "Account",
    updatedAccountPassword?._id,
    updatedAccountPassword?.accountName ?? undefined,
    difference,
    new Date()
  );

  // generate tokens
  const tokenPayload = {
    organisationId: updatedAccountPassword?.organisationId,
    accountId: updatedAccountPassword?._id,
    role: updatedAccountPassword?.roleId
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

  await ResetPassword.deleteOne({ resetCode: hashedResetCode });

  const reshapedAccount = {
    ...updatedAccountPassword?.toObject(),
    accountId: updatedAccountPassword?._id
  };

  delete reshapedAccount._id;
  delete reshapedAccount.accountPassword;
  await logActivity(
    updatedAccountPassword?.organisationId,
    updatedAccountPassword?._id,
    "User auto Sign In after password change",
    "Account",
    updatedAccountPassword?._id,
    updatedAccountPassword?.accountName ?? undefined,
    [],
    new Date()
  );
  res.status(200).json(reshapedAccount);
});
