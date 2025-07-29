import jwt from "jsonwebtoken";
import { ActivityLog } from "../models/admin/activityLogModel";
import { Account } from "../models/admin/accountModel";
import { Role } from "../models/admin/roleModel";
import { nanoid } from "nanoid";
import { Staff } from "../models/staff/profile";
import { io } from "../server";
import { StaffContract } from "../models/staff/contracts";
import { AcademicYear } from "../models/general/academicYear";

export const emitToOrganisation = (organisationId: string, collection: any) => {
  io.to(organisationId).emit("databaseChange", collection);
};

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

// generateCustomId
export const generateCustomId = (prefix: string | string[]) => {
  const joined = Array.isArray(prefix) ? prefix.join("") : prefix;
  return `${joined.trim().toUpperCase()}-${nanoid()}`;
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

export const fetchStaffProfiles = async (asWho: string, orgId: string, selfId: string) => {
  if (asWho === "Absolute Admin") {
    const staff = await Staff.find({ organisationId: orgId });
    if (!staff) {
      throwError("Error fetching staff", 500);
    }
    return staff;
  } else {
    const staff = await Staff.find({ organisationId: orgId, staffCustomId: { $ne: selfId } });
    if (!staff) {
      throwError("Error fetching staff", 500);
    }
    return staff;
  }
};

export const userIsStaff = async (customId: string, orgId: string) => {
  const staff = await Staff.findOne({ staffCustomId: customId, organisationId: orgId });
  if (!staff) {
    return null;
  }
  return staff;
};

export const fetchStaffContracts = async (query: any, limit: number, asWho: string, orgId: string, selfId: string) => {
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
  const hasNext = staffContracts.length > limit;

  if (staffContracts.length > limit) {
    staffContracts.pop();
  }
  const chunkCount = staffContracts.length;
  return {
    staffContracts: staffContracts,
    totalCount,
    chunkCount,
    nextCursor: staffContracts[staffContracts.length - 1]?._id,
    prevCursor: staffContracts[0]?._id,
    hasNext
  };
};

export const fetchAcademicYears = async (orgId: string) => {
  const academicYears = await AcademicYear.find({ organisationId: orgId });
  if (!academicYears) {
    throwError("Error fetching academic years", 500);
  }
  return academicYears;
};
