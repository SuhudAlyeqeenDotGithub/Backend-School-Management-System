import jwt from "jsonwebtoken";
import { ActivityLog } from "../models/admin/activityLogModel";
import { Account } from "../models/admin/accountModel.ts";
import { Role } from "../models/admin/roleModel.ts";
import { nanoid } from "nanoid";
import { Staff } from "../models/staff/profile.ts";
import { io } from "../server";
import { StaffContract } from "../models/staff/contracts.ts";
import { AcademicYear } from "../models/timeline/academicYear.ts";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { customAlphabet } from "nanoid";
import parsePhoneNumberFromString from "libphonenumber-js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD
  }
});

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const mailOptions = {
    from: process.env.EMAIL,
    to,
    subject,
    text,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error: any) {
    throwError(error.message || "Error sending email", 500);
  }
}

export const emitToOrganisation = (
  organisationId: string,
  collection: string,
  fullDocument: any,
  changeOperation: string
) => {
  io.to(organisationId).emit("databaseChange", { collection, fullDocument, changeOperation });
};

export const toNegative = (value: number) => {
  return Math.abs(value) * -1;
};

export const getObjectSize = (obj: any): number => {
  if (obj == null || !obj) return 0;
  return parseFloat((Buffer.byteLength(JSON.stringify(obj), "utf8") / 1024 ** 3).toString());
};

export const getLastMonth = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return `5 ${date.toLocaleString("en-GB", { month: "long", year: "numeric" })}`;
};

export const getOwnerMongoId = () => {
  return process.env.OWNER_MONGO_ID as string;
};

export const getCurrentMonth = () => {
  return `5 ${new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })}`;
};

// throw error function
export const throwError = (message: string, statusCode: number) => {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  throw error;
};

export const validatePassword = (password: string) => {
  const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>~+\-]).{8,}$/;
  return passwordStrengthRegex.test(password.trim());
};

export const validateEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

export const validatePhoneNumber = (phoneNumber: string) => {
  const trimmedPhoneNumber = phoneNumber.trim();
  const startsWithPlus = trimmedPhoneNumber.startsWith("+");
  const libParsed = parsePhoneNumberFromString(trimmedPhoneNumber);
  return startsWithPlus && libParsed?.isValid();
};

// generateSearchTextFunction
export const generateSearchText = (fields: any[]) => {
  return fields.join("|");
};

// generateCustomId
export const generateCustomId = (prefix?: string, neat = false, numberOfCharacters = 7) => {
  if (neat) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const nanoid = customAlphabet(alphabet, numberOfCharacters);
    return `${prefix ? prefix + "-" : ""}${nanoid()}`;
  }
  return `${prefix ? prefix + "-" : ""}${nanoid()}`;
};

export const generateAccessToken = (accountData: any) => {
  return jwt.sign(accountData, process.env.JWT_ACCESS_TOKEN_SECRET_KEY as string, {
    expiresIn: "1d"
  });
};

export const generateRefreshToken = (accountData: any) => {
  return jwt.sign(accountData, process.env.JWT_REFRESH_TOKEN_SECRET_KEY as string, {
    expiresIn: "30d"
  });
};

export const getVerificationCode = () => {
  const verificationCode = generateCustomId("", true, 5);
  const hashedVerificationCode = crypto.createHash("sha256").update(verificationCode).digest("hex");
  return { verificationCode, hashedVerificationCode };
};

export const codeMatches = (code: string, hashedCode: string) => {
  const hashedVerificationCode = crypto.createHash("sha256").update(code).digest("hex");
  return hashedVerificationCode === hashedCode;
};

// function to log acitivy

export const logActivity = async (
  organisationId: any,
  accountId: any,
  logAction: string,
  recordModel: string,
  recordId: any,
  recordName?: string,
  recordChange?: {}[],
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
    logDate,
    searchText: generateSearchText([accountId.toString(), logAction, recordModel, recordId.toString(), recordName])
  });

  if (!activityLog) {
    throwError("Failed to log activity", 500);
  }

  return activityLog;
};

// function to confirm account existence
export const confirmAccount = async (accountId: string) => {
  const account = await Account.findById(accountId).populate([{ path: "roleId" }, { path: "staffId" }]);
  if (!account) {
    throwError("This account does not exist", 401);
  }

  return account;
};

// function to confirm role existece
export const confirmRole = async (roleId: string) => {
  const role = await Role.findById(roleId).populate("accountId");

  if (!role) {
    throwError("This role does not exist", 401);
  }

  return role;
};

export const fetchRoles = async (asWho: string, orgId: string, selfId: string) => {
  if (asWho === "Absolute Admin") {
    const roles = await Role.find({ organisationId: orgId }).populate("accountId");
    if (!roles) {
      throwError("Error fetching roles", 500);
    }
    return roles;
  } else {
    const roles = await Role.find({ organisationId: orgId, absoluteAdmin: false, _id: { $ne: selfId } }).populate(
      "accountId"
    );
    if (!roles) {
      throwError("Error fetching roles", 500);
    }
    return roles;
  }
};

export const fetchUsers = async (asWho: string, orgId: string, selfId: string) => {
  if (asWho === "Absolute Admin") {
    const users = await Account.find({ organisationId: orgId }).populate("roleId").populate("staffId", "staffCustomId");
    if (!users) {
      throwError("Error fetching users", 500);
    }
    return users;
  } else {
    const users = await Account.find({ organisationId: orgId, accountType: "User", _id: { $ne: selfId } })
      .populate("roleId")
      .populate("staffId", "staffCustomId");
    if (!users) {
      throwError("Error fetching users", 500);
    }
    return users;
  }
};

export const fetchStaffProfiles = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let staffProfiles;
  if (asWho === "Absolute Admin") {
    staffProfiles = await Staff.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1);
  } else {
    staffProfiles = await Staff.find({ ...query, organisationId: orgId, staffCustomId: { $ne: selfId } })
      .sort({ _id: -1 })
      .limit(limit + 1);
  }

  if (!staffProfiles) {
    throwError("Error fetching staff profiles", 500);
  }
  const totalCount = await Staff.countDocuments();
  const hasNext = staffProfiles.length > limit || cursorType === "prev";

  if (staffProfiles.length > limit) {
    staffProfiles.pop();
  }
  const chunkCount = staffProfiles.length;

  return {
    staffProfiles,
    totalCount,
    chunkCount,
    nextCursor: staffProfiles[staffProfiles.length - 1]?._id,
    prevCursor: staffProfiles[0]?._id,
    hasNext
  };
};

export const userIsStaff = async (customId: string, orgId: string) => {
  const staff = await Staff.findOne({ staffCustomId: customId, organisationId: orgId });
  if (!staff) {
    return null;
  }
  return staff;
};

export const fetchStaffContracts = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let staffContracts;
  if (asWho === "Absolute Admin") {
    staffContracts = await StaffContract.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1);
  } else {
    staffContracts = await StaffContract.find({
      ...query,
      organisationId: orgId,
      staffCustomId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1);
  }

  if (!staffContracts) {
    throwError("Error fetching staff contracts", 500);
  }
  const totalCount = await StaffContract.countDocuments();
  const hasNext = staffContracts.length > limit || cursorType === "prev";

  if (staffContracts.length > limit) {
    staffContracts.pop();
  }
  const chunkCount = staffContracts.length;

  return {
    staffContracts,
    totalCount,
    chunkCount,
    nextCursor: staffContracts[staffContracts.length - 1]?._id,
    prevCursor: staffContracts[0]?._id,
    hasNext
  };
};

export const fetchAcademicYears = async (orgId: string) => {
  const academicYears = await AcademicYear.find({ organisationId: orgId }).sort({ _id: -1 }).populate("periods");
  if (!academicYears) {
    throwError("Error fetching academic years", 500);
  }
  return academicYears;
};
