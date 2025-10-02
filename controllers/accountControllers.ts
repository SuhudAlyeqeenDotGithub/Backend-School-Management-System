import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";

import { Account, defaultSettings } from "../models/admin/accountModel.ts";
import {
  codeMatches,
  getObjectSize,
  getVerificationCode,
  sendEmail,
  throwError,
  validateEmail,
  validatePassword,
  validatePhoneNumber
} from "../utils/utilsFunctions.ts";
import { Role } from "../models/admin/roleModel.ts";
import { generateRefreshToken, generateAccessToken, generateSearchText } from "../utils/utilsFunctions.ts";
import { diff } from "deep-diff";
import { VerificationCode } from "../models/authentication/resetPasswordModel.ts";
import crypto from "crypto";
import { Subscription } from "../models/admin/subscription.ts";
import { logActivity } from "../utils/utilsFunctions.ts";
import { registerBillings } from "../utils/billingFunctions.ts";

export const signupOrgAccount = asyncHandler(async (req: Request, res: Response) => {
  const {
    organisationVerificationCode,
    organisationName,
    organisationInitial,
    organisationEmail,
    organisationPhone,
    organisationPassword,
    organisationConfirmPassword
  } = req.body;

  if (!organisationVerificationCode) {
    throwError(
      "We could not read your verification code - Please make sure you are using the same browser you used to request it or enter the code again",
      400
    );
  }

  if (
    !organisationName ||
    !organisationInitial ||
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

  if (!validateEmail(organisationEmail)) {
    throwError("Please enter a valid email address.", 400);
  }

  if (!validatePassword(organisationPassword)) {
    throwError(
      "Password must be at least 8 characters long and include uppercase, lowercase, number, and at least one special character [!@#$%^&~*].",
      400
    );
  }

  if (!validatePhoneNumber(organisationPhone)) {
    throwError("Please enter a valid phone number.", 400);
  }

  const organisationEmailExists = await Account.findOne({ accountEmail: organisationEmail });
  if (organisationEmailExists) {
    throwError(`Organization already has an account with this email: ${organisationEmail}. Please sign in.`, 409);
  }

  const verificationCodeDoc = await VerificationCode.findOne({ accountEmail: organisationEmail });
  if (!verificationCodeDoc) {
    throwError(
      "No code has been sent to this email in the last 15 minutes. Please - refresh page and resend code",
      409
    );
  }

  const { verificationCode, expiresAt } = verificationCodeDoc as {
    verificationCode: string;
    expiresAt: Date;
  };

  if (!codeMatches(organisationVerificationCode, verificationCode)) {
    throwError(`Wrong Code. Please use the latest code that was sent to ${organisationEmail}`, 400);
  }

  if (expiresAt < new Date()) {
    await VerificationCode.deleteOne({ verificationCode });
    throwError(`Your verification code is expired. Please request a new one`, 409);
  }

  // begin account creation process
  const hashedPassword = await bcrypt.hash(organisationPassword, 10);

  //   create initial organization account
  const orgAccount = await Account.create({
    accountType: "Organization",
    accountName: organisationName,
    organisationInitial,
    accountEmail: organisationEmail,
    accountPhone: organisationPhone,
    accountPassword: hashedPassword,
    settings: { ...defaultSettings },
    searchText: generateSearchText([organisationName, organisationEmail, organisationPhone])
  });

  //   ensure the organization account was created successfully
  if (!orgAccount) {
    throwError("Failed to create organization account", 500);
  }

  // create an activity log for the organization account creation
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

  const freemiumSubscription = await Subscription.create({
    subscriptionType: "Freemium",
    organisationId: orgAccount._id,
    freemiumStartDate: new Date(),
    freemiumEndDate: new Date(new Date().setDate(new Date().getDate() + 30)),
    premiumStartDate: null,
    premiumEndDate: null,
    subscriptionStatus: "Active"
  });

  //   create a default role for the organization as absolute admin
  const defaultRole = await Role.create({
    organisationId: orgAccount._id,
    accountId: orgAccount._id,
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
  ).populate([
    { path: "roleId" },
    { path: "staffId" },
    { path: "organisationId", select: "organisationId accountName" }
  ]);

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

  const roleId = updatedOrgAccount?.roleId;
  const noRole = roleId === null || roleId === undefined || !roleId;
  if (noRole) {
    throwError("Couldn't fetch user role - Please contact your admin", 400);
  }

  const tokenPayload = {
    accountId: updatedOrgAccount?._id,
    organisationId: updatedOrgAccount?.organisationId?._id
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

  const parsedAccount = updatedOrgAccount?.toObject();

  const reshapedAccount = {
    ...parsedAccount,
    settings: { ...defaultSettings, ...parsedAccount?.settings },
    accountId: parsedAccount?._id
  };

  delete reshapedAccount._id;
  delete reshapedAccount.accountPassword;

  await VerificationCode.deleteOne({ verificationCode });
  const emailSent = await sendEmail(
    orgAccount.accountEmail,
    "Welcome to Al-Yeqeen School Management App - Account Created Successfully",
    `Hi ${updatedOrgAccount?.accountName}, your account has been created successfully.`,
    `   <h1 >Welcome!</h1>
    <p>Thank you for creating an account with Al-Yeqeen School Management App. We are glad to have you.</p>
    <a href="https://suhud-ayodeji-yekini-portfolio.vercel.app/"  style="
           display: inline-block;
           padding: 12px 20px;
           background-color: #64748b;
           color: white;
           text-decoration: none;
           border-radius: 6px;
           font-weight: bold;
         ">Sign in</a>`
  );

  res.status(201).json(reshapedAccount);
});

// controller to send email verification code
export const getEmailVerificationCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationName, organisationEmail } = req.body;
  if (!organisationEmail) {
    throwError("Please provide organisation (admin) email", 400);
  }

  const accountExist = await Account.findOne({ accountEmail: organisationEmail });
  if (accountExist) {
    throwError("Account with this email already exist. Please sign in instead", 400);
  }

  const { verificationCode, hashedVerificationCode } = getVerificationCode();

  if (!hashedVerificationCode || !verificationCode) {
    throwError("Error creating verification code. Please try again", 500);
  }

  const verificationCodeDoc = await VerificationCode.create({
    accountEmail: organisationEmail,
    verificationCode: hashedVerificationCode,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  });

  if (!verificationCodeDoc) {
    throwError("Error creating verification code. Please try again", 500);
  }
  console.log(verificationCodeDoc);

  // send token to account email
  await sendEmail(
    organisationEmail,
    "Email Verification Code - From Al-Yeqeen School Management App",
    `Hello ${organisationName}, your code is: ${verificationCode}. Please do not share this with anyone and use within 20 minutes`
  );

  res
    .status(200)
    .json({ message: `A verification code has been sent to email ${organisationEmail}. Please enter it below` });
});

// controller to verify new organisation email - signup
export const verifyAccount = asyncHandler(async (req: Request, res: Response) => {
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

  const verificationCodeDoc = await VerificationCode.findOne({ accountEmail: email });
  if (!verificationCodeDoc) {
    throwError(
      "No code has been sent to this email in the last 15 minutes. Please - refresh page and resend code",
      409
    );
  }

  const { verificationCode, expiresAt } = verificationCodeDoc as {
    verificationCode: string;
    expiresAt: Date;
  };

  if (!codeMatches(code, verificationCode)) {
    throwError(`Wrong Code. Please use the latest code that was sent to ${email}`, 400);
  }

  if (expiresAt < new Date()) {
    await VerificationCode.deleteOne({ verificationCode });
    throwError(`This code is expired. Please request a new one`, 409);
  }

  res.status(200).json({ message: `Code verification successful. You will now be redirected to signup` });
});

// controller to handle signin
export const signinAccount = asyncHandler(async (req: Request, res: Response) => {
  // get the email and password from the request body
  const { email, password } = req.body;
  if (!email || !password) {
    throwError("Please provide email and password", 400);
  }

  // find the account by email
  const account = await Account.findOne({ accountEmail: email }).populate([
    { path: "roleId" },
    { path: "staffId" },
    { path: "organisationId", select: "organisationId accountName" }
  ]);
  if (!account) {
    throwError(`No associated account found for email (${email}) - Please contact your admin.`, 401);
  }

  const isMatch = await bcrypt.compare(password, account!.accountPassword ?? "");
  if (!isMatch) {
    throwError("Incorrect password for associated account", 401);
  }

  const roleId = account?.roleId;
  const noRole = roleId === null || roleId === undefined || !roleId;
  if (noRole) {
    throwError("Couldn't fetch user role - Please contact your admin", 400);
  }
  // generate tokens
  const tokenPayload = {
    accountId: account?._id,
    organisationId: account?.organisationId?._id
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

  const parsedAccount = account?.toObject();

  const reshapedAccount = {
    ...parsedAccount,
    settings: { ...defaultSettings, ...parsedAccount?.settings },
    accountId: parsedAccount?._id
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

export const fetchAccount = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // find the account by email
  const account = await Account.findById(accountId).populate([
    { path: "roleId" },
    { path: "staffId" },
    { path: "organisationId", select: "organisationId accountName" }
  ]);

  if (!account) {
    throwError("Error fetching account data", 500);
  }

  if (account?.accountStatus !== "Active") {
    throwError("You account is not active - Please contact your admin if you need help", 409);
  }
  const roleId = account?.roleId;
  const noRole = roleId === null || roleId === undefined || !roleId;
  if (noRole) {
    throwError("Couldn't fetch user role - Please contact your admin", 400);
  }
  const parsedAccount = account?.toObject();

  const reshapedAccount = {
    ...parsedAccount,
    settings: { ...defaultSettings, ...parsedAccount?.settings },
    accountId: parsedAccount?._id
  };

  delete reshapedAccount._id;
  delete reshapedAccount.accountPassword;

  registerBillings(req, [
    { field: "databaseOperation", value: 3 },
    {
      field: "databaseDataTransfer",
      value: getObjectSize(account)
    }
  ]);

  res.status(200).json(reshapedAccount);
});

export const signoutAccount = asyncHandler(async (req: Request, res: Response) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  });
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  });

  res.status(200).json({ message: "Signed out successfully" });
});

// controller to refresh token
export const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  const account = await Account.findById(accountId);

  if (!account) {
    throwError("Unknown Account", 403);
  }

  const tokenPayload = {
    accountId: account?._id,
    organisationId: account?.organisationId
  };

  const accessToken = generateAccessToken(tokenPayload);

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 1000,
    sameSite: "lax"
  });
  res.status(201).json("Access token refresh successful");
});

// controller to send password reset email with code

export const resetPasswordSendEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    throwError("Please provide the associated email", 400);
  }

  const accountExist = await Account.findOne({ accountEmail: email });
  if (!accountExist) {
    throwError("Unknown Email. Please sign up if you have no existing account", 409);
  }

  const roleExist = await Role.findById(accountExist?.roleId);
  if (!roleExist) {
    throwError("Could not fetch role associated with account - Please contact your admin", 409);
  }

  if (roleExist?.absoluteAdmin !== true) {
    throwError(
      "You do not have the permission to change password - Please contact your admin for any password change",
      403
    );
  }

  const { verificationCode, hashedVerificationCode } = getVerificationCode();

  const resetPasswordDoc = await VerificationCode.create({
    accountEmail: email,
    verificationCode: hashedVerificationCode,
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
  await sendEmail(
    email,
    "Reset Password Verification Code - From Al-Yeqeen School Management App",
    `Hello ${accountExist?.accountName}, your code is: ${verificationCode}. Please do not share this with anyone and use within 8 minutes`
  );

  res.status(200).json({ message: `A verification code has been sent to email ${email}. You will now be redirected` });
});

// controller to verify password reset code
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

  const resetPasswordDoc = await VerificationCode.findOne({ accountEmail: email });
  if (!resetPasswordDoc) {
    throwError("No code has been sent to this email in the last 15 minutes. Please resend code", 409);
  }

  const { verificationCode, expiresAt } = resetPasswordDoc as {
    verificationCode: string;
    expiresAt: Date;
  };

  if (!codeMatches(code, verificationCode)) {
    await VerificationCode.deleteOne({ verificationCode });
    throwError(`Wrong Code. Please use the latest code that was sent to ${email}`, 400);
  }

  if (expiresAt < new Date()) {
    await VerificationCode.deleteOne({ verificationCode });
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

  const roleExist = await Role.findById(organisationEmailExists?.roleId);
  if (!roleExist) {
    throwError("Could not fetch role associated with account - Please contact your admin", 409);
  }

  if (roleExist?.absoluteAdmin !== true) {
    throwError(
      "You do not have the permission to change password - Please contact your admin for any password change",
      403
    );
  }
  if (!code) {
    throwError(
      "Sorry!!! we lost track of the associated code for this session. Please Ensure you are using the same browser or resend code",
      400
    );
  }

  const resetPasswordDoc = await VerificationCode.findOne({ accountEmail: organisationEmail });
  if (!resetPasswordDoc) {
    throwError("Invalid request. Please request a code to reset password", 409);
  }

  const { verificationCode, expiresAt } = resetPasswordDoc as {
    verificationCode: string;
    expiresAt: Date;
  };

  const hashedResetCode = crypto.createHash("sha256").update(code).digest("hex");
  if (hashedResetCode !== verificationCode) {
    throwError(`Invalid code, Please request a new one`, 400);
  }

  if (expiresAt < new Date()) {
    await VerificationCode.deleteOne({ verificationCode: hashedResetCode });
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

  // create an activity log for the organization account password change
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

  const roleId = updatedAccountPassword?.roleId;
  const noRole = roleId === null || roleId === undefined || !roleId;
  if (noRole) {
    throwError("Couldn't fetch user role - Please contact your admin", 400);
  }

  // generate tokens
  const tokenPayload = {
    accountId: updatedAccountPassword?._id,
    organisationId: updatedAccountPassword?.organisationId
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

  await VerificationCode.deleteOne({ resetCode: hashedResetCode });

  const parsedAccount = updatedAccountPassword?.toObject();

  const reshapedAccount = {
    ...parsedAccount,
    settings: { ...defaultSettings, ...parsedAccount?.settings },
    accountId: parsedAccount?._id
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
