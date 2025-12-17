import jwt from "jsonwebtoken";
import { ActivityLog } from "../models/admin/activityLogModel.ts";
import { Account } from "../models/admin/accountModel.ts";
import { Role } from "../models/admin/roleModel.ts";
import { nanoid } from "nanoid";
import { Staff } from "../models/staff/profile.ts";
import { io } from "../server.ts";
import { StaffContract } from "../models/staff/contracts.ts";
import { AcademicYear } from "../models/timeline/academicYear.ts";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { customAlphabet } from "nanoid";
import parsePhoneNumberFromString from "libphonenumber-js";
import { Student } from "../models/student/studentProfile.ts";
import { Programme, ProgrammeManager } from "../models/curriculum/programme.ts";
import { Pathway, PathwayManager } from "../models/curriculum/pathway.ts";
import { Class, ClassTutor } from "../models/curriculum/class.ts";
import { BaseSubject, BaseSubjectManager } from "../models/curriculum/basesubject.ts";
import { Topic } from "../models/curriculum/topic.ts";
import { Syllabus } from "../models/curriculum/syllabus.ts";
import { ClassSubject, ClassSubjectTeacher } from "../models/curriculum/classSubject.ts";
import { StudentEnrollment } from "../models/student/enrollment.ts";
import { StudentDayAttendanceTemplate } from "../models/student/dayattendance.ts";
import { StudentSubjectAttendanceTemplate } from "../models/student/subjectAttendance.ts";
import { Billing } from "../models/admin/billingModel.ts";
import { getOwnerMongoId } from "./envVariableGetters.ts";
import path from "path";
import { generateSearchText, throwError } from "./pureFuctions.ts";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD
  }
});

const logoPath = path.join(__dirname, "..", "assets", "suhudlogo.png");
export const buildEmailTemplate = (content: string) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">

    <div style="text-align: center; margin-bottom: 20px;">
      <img src="cid:logo" width="130" alt="SuSchool Logo" />
    </div>

    <div style="background: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #eee;">
      ${content}
    </div>

    <div style="text-align: center; margin-top: 20px; color: #666; font-size: 13px;">
      <p>SuSchool Team</p>
      <p>SUHUD - Evolving through code, technology, fitness, and motivation</p>
      <p>If you need help, contact: 
        <a href="mailto:suhudalyeqeenapp@gmail.com">suhudalyeqeenapp@gmail.com</a>
      </p>
    </div>

  </div>
  `;
};

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const mailOptions = {
    from: process.env.EMAIL,
    to,
    subject,
    text,
    html: html ? buildEmailTemplate(html) : buildEmailTemplate(text),
    attachments: [
      {
        filename: "suhudlogo.png",
        path: logoPath,
        cid: "logo"
      }
    ]
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error: any) {
    throwError(error.message || "Error sending email", 500);
  }
}

export async function sendEmailToOwner(subject: string, text: string, html?: string) {
  try {
    await sendEmail("suhudalyeqeenapp@gmail.com", subject, text, text);
    await sendEmail("alyekeeniy@gmail.com", subject, text, text);
  } catch (error: any) {
    throwError(error.message || "Error sending email", 500);
  }
}

export const validatePhoneNumber = (phoneNumber: string) => {
  const trimmedPhoneNumber = phoneNumber.trim();
  const startsWithPlus = trimmedPhoneNumber.startsWith("+");
  const libParsed = parsePhoneNumberFromString(trimmedPhoneNumber);
  return startsWithPlus && libParsed?.isValid();
};

export const checkAccess = (accountData: any, tabAccess: any, action: string) => {
  const assignedTabAccess = tabAccess;

  const uniqueTabs = accountData.uniqueTabAccess;

  // all tabs of each group with access of true
  const assignedTabAccessTabs = assignedTabAccess.flatMap((group: any) => group.tabs);
  const mergedTabs = [...assignedTabAccessTabs, ...uniqueTabs];

  const accountPermittedActions = mergedTabs
    .map((tab: any) => {
      return tab.actions.filter(({ permission }: any) => permission === true);
    })
    .map((tab: any) => tab.map(({ action }: any) => action))
    .flat();

  return accountPermittedActions.includes(action);
};

export const confirmUserOrgRole = async (accountId: string) => {
  const account = await confirmAccount(accountId);

  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  const role = await confirmRole(account!.roleId!._id.toString());

  return { account, role, organisation };
};

export const getGoogleCloudFileSize = async (file: any) => {
  const [metadata] = await file.getMetadata();
  // File size in bytes
  const sizeInBytes = typeof metadata.size === "number" ? metadata.size : parseInt(String(metadata.size || "0"), 10);

  // Convert to GB
  return sizeInBytes / (1024 * 1024 * 1024);
};

export const checkOrgAndUserActiveness = (organisationDoc: any, userDoc: any) => {
  if (organisationDoc.status !== "Active") {
    return {
      message: "Your organisation is not active - Please contact your admin if you need help",
      checkPassed: false
    };
  }

  if (userDoc.status !== "Active") {
    return { message: "You account is not active - Please contact your admin if you need help", checkPassed: false };
  }

  return { message: "Active", checkPassed: true };
};
export const emitToOrganisation = (
  organisationId: string,
  collection: string,
  fullDocument: any,
  changeOperation: string
) => {
  io.to(organisationId).emit("databaseChange", { collection, fullDocument, changeOperation });
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

export const generateCustomId = (
  prefix?: string,
  neat = false,
  numberOfCharacters = 7,
  paystackReference?: boolean
) => {
  if (neat) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const nanoid = customAlphabet(alphabet, numberOfCharacters);
    return `${prefix ? prefix + "-" : ""}${nanoid()}`;
  }
  if (paystackReference) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopgrstuvwxyz0123456789";
    const nanoid = customAlphabet(alphabet, numberOfCharacters);
    return `${prefix ? prefix + "-" : ""}${nanoid()}`;
  }
  return `${prefix ? prefix + "-" : ""}${nanoid()}`;
};

export const getVerificationCode = () => {
  const verificationCode = generateCustomId("SUAPP", true, 5);
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
  const account = await Account.findById(accountId)
    .populate([{ path: "roleId" }, { path: "staffId" }])
    .lean();
  if (!account) {
    throwError("This account does not exist", 401);
  }

  return account;
};

// function to confirm role existece
export const confirmRole = async (roleId: string) => {
  const role = await Role.findById(roleId).populate("accountId").lean();

  if (!role) {
    throwError("This role does not exist", 401);
  }

  return role;
};

export const fetchRoles = async (asWho: string, orgId: string, selfId: string) => {
  if (asWho === "Absolute Admin") {
    const roles = await Role.find({ organisationId: orgId }).populate("accountId").sort({ _id: -1 }).lean();
    if (!roles) {
      throwError("Error fetching roles", 500);
    }
    return roles;
  } else {
    const roles = await Role.find({ organisationId: orgId, absoluteAdmin: false, _id: { $ne: selfId } })
      .sort({ _id: -1 })
      .populate("accountId")
      .lean();
    if (!roles) {
      throwError("Error fetching roles", 500);
    }
    return roles;
  }
};

export const fetchUsers = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let users;
  let totalCount;
  if (asWho === "Absolute Admin") {
    users = await Account.find(
      { ...query, organisationId: orgId },
      "_id organisationId staffId roleId uniqueTabAccess features searchText status email name createdAt updatedAt"
    )
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate([{ path: "staffId" }, { path: "roleId" }])
      .lean();
    totalCount = await Account.countDocuments({ ...query, organisationId: orgId });
  } else {
    users = await Account.find(
      { ...query, organisationId: orgId, staffId: { $ne: selfId } },
      "_id organisationId staffId roleId uniqueTabAccess features searchText status email name createdAt updatedAt"
    )
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate([{ path: "staffId" }, { path: "roleId" }])
      .lean();
    totalCount = await Account.countDocuments({ ...query, organisationId: orgId, staffId: { $ne: selfId } });
  }

  if (!users) {
    throwError("Error fetching users", 500);
  }
  const hasNext = users.length > limit || cursorType === "prev";

  if (users.length > limit) {
    users.pop();
  }
  const chunkCount = users.length;

  return {
    users,
    totalCount,
    chunkCount,
    nextCursor: users[users.length - 1]?._id,
    prevCursor: users[0]?._id,
    hasNext
  };
};

export const fetchActivityLogs = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const activityLogs = await ActivityLog.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate([{ path: "accountId", populate: [{ path: "staffId" }, { path: "roleId" }] }, { path: "recordId" }])
    .lean();
  const totalCount = await ActivityLog.countDocuments({ ...query, organisationId: orgId });

  if (!activityLogs) {
    throwError("Error fetching activity Logs", 500);
  }
  const hasNext = activityLogs.length > limit || cursorType === "prev";

  if (activityLogs.length > limit) {
    activityLogs.pop();
  }
  const chunkCount = activityLogs.length;

  return {
    activityLogs,
    totalCount,
    chunkCount,
    nextCursor: activityLogs[activityLogs.length - 1]?._id,
    prevCursor: activityLogs[0]?._id,
    hasNext
  };
};

export const fetchBillings = async (
  query: any,
  cursorType: string,
  limit: number,
  orgId: string,
  accountId: string
) => {
  let billings;
  let totalCount;

  if (accountId === getOwnerMongoId()) {
    billings = await Billing.find({ ...query })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate({
        path: "organisationId",
        select: "organisationId name email phone organisationInitial accountType"
      })
      .lean();
    totalCount = await Billing.countDocuments({ ...query });
  } else {
    billings = await Billing.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate({
        path: "organisationId",
        select: "organisationId name email phone organisationInitial accountType"
      })
      .lean();
    totalCount = await Billing.countDocuments({ ...query, organisationId: orgId });
  }

  if (!billings) {
    throwError("Error fetching billings", 500);
  }
  const hasNext = billings.length > limit || cursorType === "prev";

  if (billings.length > limit) {
    billings.pop();
  }
  const chunkCount = billings.length;

  return {
    billings,
    totalCount,
    chunkCount,
    nextCursor: billings[billings.length - 1]?._id,
    prevCursor: billings[0]?._id,
    hasNext
  };
};

export const fetchAllStaffProfiles = async (asWho: string, orgId: string, selfId: string) => {
  let staffProfiles;
  if (asWho === "Absolute Admin") {
    staffProfiles = await Staff.find({ organisationId: orgId }).sort({ _id: -1 }).lean();
  } else {
    staffProfiles = await Staff.find({ organisationId: orgId, customId: { $ne: selfId } })
      .sort({ _id: -1 })
      .lean();
  }

  if (!staffProfiles) {
    throwError("Error fetching staff profiles", 500);
  }

  return staffProfiles;
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
  let totalCount;
  if (asWho === "Absolute Admin") {
    staffProfiles = await Staff.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await Staff.countDocuments({ ...query, organisationId: orgId });
  } else {
    staffProfiles = await Staff.find({ ...query, organisationId: orgId, customId: { $ne: selfId } })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await Staff.countDocuments({ ...query, organisationId: orgId, customId: { $ne: selfId } });
  }

  if (!staffProfiles) {
    throwError("Error fetching staff profiles", 500);
  }
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

export const fetchAllStudentProfiles = async (asWho: string, orgId: string, selfId: string) => {
  let studentProfiles;
  if (asWho === "Absolute Admin") {
    studentProfiles = await Student.find({ organisationId: orgId }).sort({ _id: -1 }).lean();
  } else {
    studentProfiles = await Student.find({ organisationId: orgId, studentCustomId: { $ne: selfId } })
      .sort({ _id: -1 })
      .lean();
  }

  if (!studentProfiles) {
    throwError("Error fetching student profiles", 500);
  }

  return studentProfiles;
};

export const fetchStudentProfiles = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let studentProfiles;
  let totalCount;
  if (asWho === "Absolute Admin") {
    studentProfiles = await Student.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await Student.countDocuments({ ...query, organisationId: orgId });
  } else {
    studentProfiles = await Student.find({ ...query, organisationId: orgId, studentCustomId: { $ne: selfId } })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await Student.countDocuments({ ...query, organisationId: orgId, studentCustomId: { $ne: selfId } });
  }

  if (!studentProfiles) {
    throwError("Error fetching student profiles", 500);
  }
  const hasNext = studentProfiles.length > limit || cursorType === "prev";

  if (studentProfiles.length > limit) {
    studentProfiles.pop();
  }
  const chunkCount = studentProfiles.length;

  return {
    studentProfiles,
    totalCount,
    chunkCount,
    nextCursor: studentProfiles[studentProfiles.length - 1]?._id,
    prevCursor: studentProfiles[0]?._id,
    hasNext
  };
};

export const fetchAllProgrammes = async (orgId: string) => {
  const programmes = await Programme.find({ organisationId: orgId }).lean();

  if (!programmes) {
    throwError("Error fetching programmes", 500);
  }

  return programmes;
};

export const fetchProgrammes = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const programmes = await Programme.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await Programme.countDocuments({ ...query, organisationId: orgId });

  if (!programmes) {
    throwError("Error fetching programmes", 500);
  }
  const hasNext = programmes.length > limit || cursorType === "prev";

  if (programmes.length > limit) {
    programmes.pop();
  }
  const chunkCount = programmes.length;

  return {
    programmes,
    totalCount,
    chunkCount,
    nextCursor: programmes[programmes.length - 1]?._id,
    prevCursor: programmes[0]?._id,
    hasNext
  };
};

export const fetchProgrammeManagers = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let programmeManagers;
  let totalCount;
  if (asWho === "Absolute Admin") {
    programmeManagers = await ProgrammeManager.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await ProgrammeManager.countDocuments({ ...query, organisationId: orgId });
  } else {
    programmeManagers = await ProgrammeManager.find({
      ...query,
      organisationId: orgId,
      programmeManagerStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await ProgrammeManager.countDocuments({
      ...query,
      organisationId: orgId,
      programmeManagerStaffId: { $ne: selfId }
    });
  }

  if (!programmeManagers) {
    throwError("Error fetching programme managers", 500);
  }
  const hasNext = programmeManagers.length > limit || cursorType === "prev";

  if (programmeManagers.length > limit) {
    programmeManagers.pop();
  }
  const chunkCount = programmeManagers.length;

  return {
    programmeManagers,
    totalCount,
    chunkCount,
    nextCursor: programmeManagers[programmeManagers.length - 1]?._id,
    prevCursor: programmeManagers[0]?._id,
    hasNext
  };
};

export const fetchAllPathways = async (orgId: string) => {
  const pathways = await Pathway.find({ organisationId: orgId }).sort({ _id: -1 }).lean();

  if (!pathways) {
    throwError("Error fetching student profiles", 500);
  }

  return pathways;
};

export const fetchPathways = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const pathways = await Pathway.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await Pathway.countDocuments({ ...query, organisationId: orgId });

  if (!pathways) {
    throwError("Error fetching pathways", 500);
  }
  const hasNext = pathways.length > limit || cursorType === "prev";

  if (pathways.length > limit) {
    pathways.pop();
  }
  const chunkCount = pathways.length;

  return {
    pathways,
    totalCount,
    chunkCount,
    nextCursor: pathways[pathways.length - 1]?._id,
    prevCursor: pathways[0]?._id,
    hasNext
  };
};

export const fetchPathwayManagers = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let pathwayManagers;
  let totalCount;
  if (asWho === "Absolute Admin") {
    pathwayManagers = await PathwayManager.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await PathwayManager.countDocuments({ ...query, organisationId: orgId });
  } else {
    pathwayManagers = await PathwayManager.find({
      ...query,
      organisationId: orgId,
      pathwayManagerStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await PathwayManager.countDocuments({
      ...query,
      organisationId: orgId,
      pathwayManagerStaffId: { $ne: selfId }
    });
  }

  if (!pathwayManagers) {
    throwError("Error fetching pathway managers", 500);
  }
  const hasNext = pathwayManagers.length > limit || cursorType === "prev";

  if (pathwayManagers.length > limit) {
    pathwayManagers.pop();
  }
  const chunkCount = pathwayManagers.length;

  return {
    pathwayManagers,
    totalCount,
    chunkCount,
    nextCursor: pathwayManagers[pathwayManagers.length - 1]?._id,
    prevCursor: pathwayManagers[0]?._id,
    hasNext
  };
};

export const fetchAllClasses = async (orgId: string) => {
  const classs = await Class.find({ organisationId: orgId }).sort({ _id: -1 }).lean();

  if (!classs) {
    throwError("Error fetching classs", 500);
  }

  return classs;
};

export const fetchClasses = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const classs = await Class.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await Class.countDocuments({ ...query, organisationId: orgId });

  if (!classs) {
    throwError("Error fetching classs", 500);
  }
  const hasNext = classs.length > limit || cursorType === "prev";

  if (classs.length > limit) {
    classs.pop();
  }
  const chunkCount = classs.length;

  return {
    classs,
    totalCount,
    chunkCount,
    nextCursor: classs[classs.length - 1]?._id,
    prevCursor: classs[0]?._id,
    hasNext
  };
};

export const fetchClassTutors = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let classTutors;
  let totalCount;
  if (asWho === "Absolute Admin") {
    classTutors = await ClassTutor.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await ClassTutor.countDocuments({ ...query, organisationId: orgId });
  } else {
    classTutors = await ClassTutor.find({
      ...query,
      organisationId: orgId,
      classTutorStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await ClassTutor.countDocuments({
      ...query,
      organisationId: orgId,
      classTutorStaffId: { $ne: selfId }
    });
  }

  if (!classTutors) {
    throwError("Error fetching class managers", 500);
  }
  const hasNext = classTutors.length > limit || cursorType === "prev";

  if (classTutors.length > limit) {
    classTutors.pop();
  }
  const chunkCount = classTutors.length;

  return {
    classTutors,
    totalCount,
    chunkCount,
    nextCursor: classTutors[classTutors.length - 1]?._id,
    prevCursor: classTutors[0]?._id,
    hasNext
  };
};

export const fetchAllClassTutors = async (orgId: string) => {
  const classTutors = await ClassTutor.find({ organisationId: orgId }).lean();

  if (!classTutors) {
    throwError("Error fetching class managers", 500);
  }

  return classTutors;
};

export const fetchAllPathwayManagers = async (orgId: string) => {
  const pathwayManagers = await PathwayManager.find({ organisationId: orgId }).lean();

  if (!pathwayManagers) {
    throwError("Error fetching pathway managers", 500);
  }

  return pathwayManagers;
};

export const fetchAllBaseSubjects = async (orgId: string) => {
  const baseSubjects = await BaseSubject.find({ organisationId: orgId }).lean();

  if (!baseSubjects) {
    throwError("Error fetching base subjects", 500);
  }

  return baseSubjects;
};

export const fetchBaseSubjects = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const baseSubjects = await BaseSubject.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await BaseSubject.countDocuments({ ...query, organisationId: orgId });

  if (!baseSubjects) {
    throwError("Error fetching base subjects", 500);
  }
  const hasNext = baseSubjects.length > limit || cursorType === "prev";

  if (baseSubjects.length > limit) {
    baseSubjects.pop();
  }
  const chunkCount = baseSubjects.length;

  return {
    baseSubjects,
    totalCount,
    chunkCount,
    nextCursor: baseSubjects[baseSubjects.length - 1]?._id,
    prevCursor: baseSubjects[0]?._id,
    hasNext
  };
};

export const fetchBaseSubjectManagers = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let baseSubjectManagers;
  let totalCount;
  if (asWho === "Absolute Admin") {
    baseSubjectManagers = await BaseSubjectManager.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await BaseSubjectManager.countDocuments({ ...query, organisationId: orgId });
  } else {
    baseSubjectManagers = await BaseSubjectManager.find({
      ...query,
      organisationId: orgId,
      baseSubjectManagerStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await BaseSubjectManager.countDocuments({
      ...query,
      organisationId: orgId,
      baseSubjectManagerStaffId: { $ne: selfId }
    });
  }

  if (!baseSubjectManagers) {
    throwError("Error fetching base subject managers", 500);
  }
  const hasNext = baseSubjectManagers.length > limit || cursorType === "prev";

  if (baseSubjectManagers.length > limit) {
    baseSubjectManagers.pop();
  }
  const chunkCount = baseSubjectManagers.length;

  return {
    baseSubjectManagers,
    totalCount,
    chunkCount,
    nextCursor: baseSubjectManagers[baseSubjectManagers.length - 1]?._id,
    prevCursor: baseSubjectManagers[0]?._id,
    hasNext
  };
};

export const fetchAllTopics = async (orgId: string) => {
  const topics = await Topic.find({ organisationId: orgId }).lean();

  if (!topics) {
    throwError("Error fetching topics", 500);
  }

  return topics;
};

export const fetchTopics = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const topics = await Topic.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await Topic.countDocuments({ ...query, organisationId: orgId });

  if (!topics) {
    throwError("Error fetching topics", 500);
  }
  const hasNext = topics.length > limit || cursorType === "prev";

  if (topics.length > limit) {
    topics.pop();
  }
  const chunkCount = topics.length;

  return {
    topics,
    totalCount,
    chunkCount,
    nextCursor: topics[topics.length - 1]?._id,
    prevCursor: topics[0]?._id,
    hasNext
  };
};

export const fetchAllClassSubjects = async (orgId: string) => {
  const subjects = await ClassSubject.find({ organisationId: orgId }).lean();

  if (!subjects) {
    throwError("Error fetching class subjects", 500);
  }

  return subjects;
};

export const fetchClassSubjects = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const classSubjects = await ClassSubject.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await ClassSubject.countDocuments({ ...query, organisationId: orgId });

  if (!classSubjects) {
    throwError("Error fetching class subjects", 500);
  }
  const hasNext = classSubjects.length > limit || cursorType === "prev";

  if (classSubjects.length > limit) {
    classSubjects.pop();
  }
  const chunkCount = classSubjects.length;

  return {
    classSubjects,
    totalCount,
    chunkCount,
    nextCursor: classSubjects[classSubjects.length - 1]?._id,
    prevCursor: classSubjects[0]?._id,
    hasNext
  };
};

export const fetchAllClassSubjectTeachers = async (orgId: string) => {
  const subjectTeachers = await ClassSubjectTeacher.find({ organisationId: orgId }).lean();

  if (!subjectTeachers) {
    throwError("Error fetching class subject teachers", 500);
  }

  return subjectTeachers;
};

export const fetchClassSubjectTeachers = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let classSubjectTeachers;
  let totalCount;
  if (asWho === "Absolute Admin") {
    classSubjectTeachers = await ClassSubjectTeacher.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await ClassSubjectTeacher.countDocuments({ ...query, organisationId: orgId });
  } else {
    classSubjectTeachers = await ClassSubjectTeacher.find({
      ...query,
      organisationId: orgId,
      classSubjectTeacherStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await ClassSubjectTeacher.countDocuments({
      ...query,
      organisationId: orgId,
      classSubjectTeacherStaffId: { $ne: selfId }
    });
  }

  if (!classSubjectTeachers) {
    throwError("Error fetching class managers", 500);
  }
  const hasNext = classSubjectTeachers.length > limit || cursorType === "prev";

  if (classSubjectTeachers.length > limit) {
    classSubjectTeachers.pop();
  }
  const chunkCount = classSubjectTeachers.length;

  return {
    classSubjectTeachers,
    totalCount,
    chunkCount,
    nextCursor: classSubjectTeachers[classSubjectTeachers.length - 1]?._id,
    prevCursor: classSubjectTeachers[0]?._id,
    hasNext
  };
};
export const fetchAllSyllabuses = async (orgId: string) => {
  const syllabuses = await Syllabus.find({ organisationId: orgId }).sort({ _id: -1 });

  if (!syllabuses) {
    throwError("Error fetching syllabuses", 500);
  }

  return syllabuses;
};

export const fetchSyllabuses = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const syllabuses = await Syllabus.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await Syllabus.countDocuments({ ...query, organisationId: orgId });

  if (!syllabuses) {
    throwError("Error fetching syllabuses", 500);
  }
  const hasNext = syllabuses.length > limit || cursorType === "prev";

  if (syllabuses.length > limit) {
    syllabuses.pop();
  }
  const chunkCount = syllabuses.length;

  return {
    syllabuses,
    totalCount,
    chunkCount,
    nextCursor: syllabuses[syllabuses.length - 1]?._id,
    prevCursor: syllabuses[0]?._id,
    hasNext
  };
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
  let totalCount;
  if (asWho === "Absolute Admin") {
    staffContracts = await StaffContract.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await StaffContract.countDocuments({ ...query, organisationId: orgId });
  } else {
    staffContracts = await StaffContract.find({
      ...query,
      organisationId: orgId,
      staffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    totalCount = await StaffContract.countDocuments({
      ...query,
      organisationId: orgId,
      staffId: { $ne: selfId }
    });
  }

  if (!staffContracts) {
    throwError("Error fetching staff contracts", 500);
  }

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

export const fetchAllStaffContracts = async (asWho: string, orgId: string, selfId: string) => {
  let staffContracts;
  if (asWho === "Absolute Admin") {
    staffContracts = await StaffContract.find({ organisationId: orgId }).lean();
  } else {
    staffContracts = await StaffContract.find({ organisationId: orgId, staffId: { $ne: selfId } }).lean();
  }
  if (!staffContracts) {
    throwError("Error fetching staff contracts", 500);
  }

  return staffContracts;
};

export const fetchStudentEnrollments = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const studentEnrollments = await StudentEnrollment.find({
    ...query,
    organisationId: orgId
  })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await StudentEnrollment.countDocuments({
    ...query,
    organisationId: orgId
  });

  if (!studentEnrollments) {
    throwError("Error fetching student contracts", 500);
  }

  const hasNext = studentEnrollments.length > limit || cursorType === "prev";

  if (studentEnrollments.length > limit) {
    studentEnrollments.pop();
  }
  const chunkCount = studentEnrollments.length;

  return {
    studentEnrollments,
    totalCount,
    chunkCount,
    nextCursor: studentEnrollments[studentEnrollments.length - 1]?._id,
    prevCursor: studentEnrollments[0]?._id,
    hasNext
  };
};

export const fetchStudentDayAttendances = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const studentDayAttendances = await StudentDayAttendanceTemplate.find({
    ...query,
    organisationId: orgId
  })
    .populate("studentDayAttendances")
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await StudentDayAttendanceTemplate.countDocuments({
    ...query,
    organisationId: orgId
  });

  if (!studentDayAttendances) {
    throwError("Error fetching student contracts", 500);
  }

  const hasNext = studentDayAttendances.length > limit || cursorType === "prev";

  if (studentDayAttendances.length > limit) {
    studentDayAttendances.pop();
  }
  const chunkCount = studentDayAttendances.length;

  return {
    studentDayAttendances,
    totalCount,
    chunkCount,
    nextCursor: studentDayAttendances[studentDayAttendances.length - 1]?._id,
    prevCursor: studentDayAttendances[0]?._id,
    hasNext
  };
};

export const fetchStudentSubjectAttendances = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const studentSubjectAttendances = await StudentSubjectAttendanceTemplate.find({
    ...query,
    organisationId: orgId
  })
    .populate("studentSubjectAttendances")
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const totalCount = await StudentSubjectAttendanceTemplate.countDocuments({
    ...query,
    organisationId: orgId
  });

  if (!studentSubjectAttendances) {
    throwError("Error fetching student contracts", 500);
  }

  const hasNext = studentSubjectAttendances.length > limit || cursorType === "prev";

  if (studentSubjectAttendances.length > limit) {
    studentSubjectAttendances.pop();
  }
  const chunkCount = studentSubjectAttendances.length;

  return {
    studentSubjectAttendances,
    totalCount,
    chunkCount,
    nextCursor: studentSubjectAttendances[studentSubjectAttendances.length - 1]?._id,
    prevCursor: studentSubjectAttendances[0]?._id,
    hasNext
  };
};
export const fetchAllStudentEnrollments = async (orgId: string) => {
  const studentEnrollments = await StudentEnrollment.find({ organisationId: orgId }).lean();
  if (!studentEnrollments) {
    throwError("Error fetching student enrollments", 500);
  }

  return studentEnrollments;
};

export const fetchAcademicYears = async (orgId: string) => {
  const academicYears = await AcademicYear.find({ organisationId: orgId }).sort({ _id: -1 }).populate("periods").lean();
  if (!academicYears) {
    throwError("Error fetching academic years", 500);
  }
  return academicYears;
};
