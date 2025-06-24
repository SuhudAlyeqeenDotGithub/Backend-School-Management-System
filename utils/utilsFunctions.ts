import jwt from "jsonwebtoken";
import { ActivityLog } from "../models/activityLogModel";
import { Account } from "../models/accountModel";
import { Role } from "../models/roleModel";

// throw error function
export const throwError = (message: string, statusCode: number) => {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  throw error;
};

// generateSearchTextFunction
export const generateSearchText = (fields: any[]) => {
  return fields.join("|");
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

// function to log acitivy

export const logActivity = async (
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
  const account = await Account.findById(accountId).populate([
    { path: "roleId" },
    { path: "staffId" },
    { path: "organisationId" }
  ]);
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
