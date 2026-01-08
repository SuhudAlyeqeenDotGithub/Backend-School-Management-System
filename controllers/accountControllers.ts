import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";

import { Account, defaultSettings } from "../models/admin/accountModel.ts";
import { codeMatches, getVerificationCode, sendEmail, validatePhoneNumber } from "../utils/databaseFunctions.ts";

import {
  throwError,
  validateEmail,
  validatePassword,
  generateSearchText,
  getObjectSize
} from "../utils/pureFuctions.ts";
import { Role } from "../models/admin/roleModel.ts";
import { generateRefreshToken, generateAccessToken } from "../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { VerificationCode } from "../models/authentication/resetPasswordModel.ts";
import crypto from "crypto";
import { Subscription } from "../models/admin/subscription.ts";
import { logActivity } from "../utils/databaseFunctions.ts";
import { registerBillings } from "../utils/billingFunctions.ts";
import { Feature } from "../models/admin/features.ts";

export const signupOrgAccount = asyncHandler(async (req: Request, res: Response) => {
  const {
    organisationVerificationCode,
    organisationName,
    organisationInitial,
    organisationEmail,
    organisationPhone,
    organisationPassword,
    country,
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
    !organisationConfirmPassword ||
    !country
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

  const organisationEmailExists = await Account.findOne({ email: organisationEmail });
  if (organisationEmailExists) {
    throwError(`Organization already has an account with this email: ${organisationEmail}. Please sign in.`, 409);
  }

  const verificationCodeDoc = await VerificationCode.findOne({ email: organisationEmail });
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
    name: organisationName,
    organisationInitial,
    email: organisationEmail,
    phone: organisationPhone,
    password: hashedPassword,
    country,
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
    orgAccount?.name ?? undefined,
    [
      {
        kind: "N",
        rhs: {
          _id: orgAccount._id,
          accountType: orgAccount.accountType,
          name: orgAccount.name,
          email: orgAccount.email,
          phone: orgAccount.phone
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

  if (!freemiumSubscription) {
    throwError(
      "Failed to create freemium subscription for this organization - Please try again, and if the problem persists contact support",
      500
    );
  }

  //   create a default role for the organization as absolute admin
  const defaultRole = await Role.create({
    organisationId: orgAccount._id,
    accountId: orgAccount._id,
    name: `Absolute Admin for organization (${organisationName})`,
    description: `This is the default role for the organization (${organisationName}), it has all permissions`,
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
    defaultRole?.name ?? undefined,
    [
      {
        kind: "N",
        rhs: {
          _id: defaultRole._id,
          name: defaultRole.name,
          description: defaultRole.description,
          absoluteAdmin: defaultRole.absoluteAdmin
        }
      }
    ],
    new Date()
  );

  const mandatoryFeatures = await Feature.find({ isMandatory: true });

  const defaultFeatures = mandatoryFeatures.map((feature) => {
    return {
      featureId: feature._id,
      featureName: feature.name,
      addedOn: new Date(),
      tabs: feature.tabs,
      mandatory: feature.mandatory
    };
  });

  // update the organization account with the default role and mandatory features
  const updatedOrgAccount = await Account.findByIdAndUpdate(
    orgAccount._id,
    { roleId: defaultRole._id, features: defaultFeatures },
    { new: true }
  ).populate([{ path: "roleId" }, { path: "staffId" }, { path: "organisationId", select: "organisationId name _id" }]);

  if (!updatedOrgAccount) {
    throwError("Failed to update organization account with default role", 500);
  }

  // create an activity log for the organization account update with default role
  // get the updated data
  const original = {
    _id: orgAccount._id,
    accountType: orgAccount.accountType,
    name: orgAccount.name,
    email: orgAccount.email,
    phone: orgAccount.phone,
    roleId: ""
  };
  const updated = {
    _id: updatedOrgAccount?._id,
    accountType: updatedOrgAccount?.accountType,
    name: updatedOrgAccount?.name,
    email: updatedOrgAccount?.email,
    phone: updatedOrgAccount?.phone,
    roleId: updatedOrgAccount?.roleId
  };

  let activityLog;

  const difference = diff(original, updated);
  activityLog = await logActivity(
    orgAccount._id,
    orgAccount._id,
    `Updating organization (${organisationName}) Account with Default Role`,
    "Account",
    updatedOrgAccount?._id,
    updatedOrgAccount?.name ?? undefined,
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
  delete reshapedAccount.password;

  await VerificationCode.deleteOne({ verificationCode });
  const emailSent = await sendEmail(
    req,
    orgAccount.email,
    "Welcome to SuSchool Management App - Account Created Successfully",
    `Hi ${updatedOrgAccount?.name}, your account has been created successfully.`,
    `   <h1 >Welcome!</h1>
    <p>Thank you for creating an account with SuSchool. We are glad to have you.</p>
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

  const accountExist = await Account.findOne({ email: organisationEmail });
  if (accountExist) {
    throwError("Account with this email already exist. Please sign in instead", 400);
  }

  const { verificationCode, hashedVerificationCode } = getVerificationCode();

  if (!hashedVerificationCode || !verificationCode) {
    throwError("Error creating verification code. Please try again", 500);
  }

  const verificationCodeDoc = await VerificationCode.create({
    email: organisationEmail,
    verificationCode: hashedVerificationCode,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  });

  if (!verificationCodeDoc) {
    throwError("Error creating verification code. Please try again", 500);
  }

  // send token to account email
  await sendEmail(
    req,
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

  const verificationCodeDoc = await VerificationCode.findOne({ email: email });
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
  const account = await Account.findOne({ email: email }).populate([
    { path: "roleId" },
    { path: "staffId" },
    { path: "organisationId", select: "organisationId name features _id" }
  ]);
  if (!account) {
    throwError(
      `No associated account found for email (${email}) - Sign up if you have no existing account. Or contact your admin.`,
      401
    );
  }

  const isMatch = await bcrypt.compare(password, account!.password ?? "");
  if (!isMatch) {
    throwError("Incorrect password for associated account", 401);
  }

  const inactiveAccount = account?.status !== "Active";
  if (inactiveAccount) {
    throwError("Your account is inactive or locked. Please contact your admin", 400);
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
  delete reshapedAccount.password;

  const activityLog = await logActivity(
    account?.organisationId,
    account?._id,
    "User Sign In",
    "Account",
    account?._id,
    account?.name ?? undefined,
    [],
    new Date()
  );

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 5
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([account, activityLog])
    }
  ]);

  res.status(200).json(reshapedAccount);
});

export const fetchAccount = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // find the account by email

  const account = await Account.findById(accountId).populate([
    { path: "roleId" },
    { path: "staffId" },
    { path: "organisationId", select: "organisationId name features" }
  ]);

  if (!account) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize(account)
      }
    ]);
    throwError("Error fetching account data", 500);
  }

  if (account?.status !== "Active") {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize(account)
      }
    ]);
    throwError("You account is not active - Please contact your admin if you need help", 409);
  }

  const parsedAccount = account?.toObject();

  const reshapedAccount = {
    ...parsedAccount,
    settings: { ...defaultSettings, ...parsedAccount?.settings },
    accountId: parsedAccount?._id
  };

  delete reshapedAccount._id;
  delete reshapedAccount.password;

  registerBillings(req, [
    { field: "databaseOperation", value: 4 },
    {
      field: "databaseDataTransfer",
      value: getObjectSize(account)
    }
  ]);

  res.status(200).json(reshapedAccount);
});

export const fetchSpecificAccount = asyncHandler(async (req: Request, res: Response) => {
  // find the account by email
  const { specificAccountId } = req.query;

  const account = await Account.findById(specificAccountId, "email name _id");

  if (!account) {
    registerBillings(req, [
      { field: "databaseOperation", value: 1 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize(account)
      }
    ]);
    throwError("Error fetching account data", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 1 },
    {
      field: "databaseDataTransfer",
      value: getObjectSize(account)
    }
  ]);

  res.status(200).json(account);
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

  registerBillings(req, [
    { field: "databaseOperation", value: 1 },
    {
      field: "databaseDataTransfer",
      value: getObjectSize(account)
    }
  ]);
  res.status(201).json("Access token refresh successful");
});

// controller to send password reset email with code

export const resetPasswordSendEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    throwError("Please provide the associated email", 400);
  }

  const accountExist = await Account.findOne({ email: email });
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

  let deletedCodes = { deletedCount: 0 };
  const previousCode = await VerificationCode.find({ email: email });
  if (previousCode.length > 0) {
    deletedCodes = await VerificationCode.deleteMany({ email: email });
  }

  const { verificationCode, hashedVerificationCode } = getVerificationCode();

  const resetPasswordDoc = await VerificationCode.create({
    email: email,
    verificationCode: hashedVerificationCode,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });

  if (!resetPasswordDoc) {
    throwError("Error reset password", 500);
  }

  // create a log for reset password request

  let activityLog;
  const logActivityAllowed = accountExist?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      accountExist?._id,
      accountExist?._id,
      "Reset Password Request",
      "None",
      resetPasswordDoc._id,
      "Reset Password",
      [],
      new Date()
    );
  }

  // send token to account email
  await sendEmail(
    req,
    email,
    "Reset Password Verification Code - From Al-Yeqeen School Management App",
    `Hello ${accountExist?.name}, your code is: ${verificationCode}. Please do not share this with anyone and use within 8 minutes`
  );

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 4 + (logActivityAllowed ? 2 : 0) + previousCode.length + deletedCodes?.deletedCount
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([roleExist, accountExist, resetPasswordDoc, previousCode]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

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

  const resetPasswordDoc = await VerificationCode.findOne({ email: email });
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

  registerBillings(req, [
    { field: "databaseOperation", value: 5 },
    {
      field: "databaseDataTransfer",
      value: getObjectSize(resetPasswordDoc)
    }
  ]);
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

  const organisationEmailExists = await Account.findOne({ email: organisationEmail }).lean();
  if (!organisationEmailExists) {
    throwError(`Organization with email ${organisationEmail} does not exist. Please sign up`, 409);
  }

  const roleExist = await Role.findById(organisationEmailExists?.roleId).lean();
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

  const resetPasswordDoc = await VerificationCode.findOne({ email: organisationEmail }).lean();
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
    { password: hashedPassword },
    { new: true }
  )
    .populate([
      { path: "roleId" },
      { path: "staffId" },
      { path: "organisationId", select: "organisationId name features" }
    ])
    .lean();

  if (!updatedAccountPassword) {
    throwError("Failed to change password", 500);
  }

  // create an activity log for the organization account password change
  // get the difference in old and new

  let activityLog;
  const logActivityAllowed = organisationEmailExists?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(organisationEmailExists, updatedAccountPassword);
    activityLog = await logActivity(
      updatedAccountPassword?._id,
      updatedAccountPassword?._id,
      `Changing organisation ${updatedAccountPassword?.name} password`,
      "Account",
      updatedAccountPassword?._id,
      updatedAccountPassword?.name ?? undefined,
      difference,
      new Date()
    );
  }

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

  const deletedCode = await VerificationCode.deleteOne({ resetCode: hashedResetCode });

  const parsedAccount = updatedAccountPassword;

  const reshapedAccount = {
    ...parsedAccount,
    settings: { ...defaultSettings, ...parsedAccount?.settings },
    accountId: parsedAccount?._id
  };

  delete reshapedAccount._id;
  delete reshapedAccount.password;
  let activityLog2;

  if (logActivityAllowed) {
    activityLog2 = await logActivity(
      updatedAccountPassword?.organisationId,
      updatedAccountPassword?._id,
      "User auto Sign In after password change",
      "Account",
      updatedAccountPassword?._id,
      updatedAccountPassword?.name ?? undefined,
      [],
      new Date()
    );
  }

  await sendEmail(
    req,
    reshapedAccount.email as string,
    "Password Changed Successfully - From SuSchool Management App",
    `Hello ${updatedAccountPassword?.name}, your password has been changed successfully. If you did not perform this action, please contact support immediately @ suhudalyeqeenapp@gmail.com or alyekeeniy@gmail.com`
  );
  registerBillings(req, [
    { field: "databaseOperation", value: 12 + (logActivityAllowed ? 4 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([roleExist, deletedCode, updatedAccountPassword, resetPasswordDoc, organisationEmailExists]) +
        (logActivityAllowed ? getObjectSize([activityLog, activityLog2]) : 0)
    }
  ]);

  res.status(200).json(reshapedAccount);
});
