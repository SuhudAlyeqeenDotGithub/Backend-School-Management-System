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
import { Student } from "../models/student/studentProfile.ts";
import { Programme, ProgrammeManager } from "../models/curriculum/programme.ts";
import { Course, CourseManager } from "../models/curriculum/course.ts";
import { Level, LevelManager } from "../models/curriculum/level.ts";
import { BaseSubject, BaseSubjectManager } from "../models/curriculum/basesubject.ts";
import { Topic } from "../models/curriculum/topic.ts";
import { Syllabus } from "../models/curriculum/syllabus.ts";
import { Subject, SubjectTeacher } from "../models/curriculum/subject.ts";
import { StudentEnrollment } from "../models/student/enrollment.ts";
import { StudentDayAttendanceTemplate } from "../models/student/dayattendance.ts";
import { StudentSubjectAttendanceTemplate } from "../models/student/subjectAttendance.ts";
import { Billing } from "../models/admin/billingModel.ts";

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
  if (organisationDoc.accountStatus !== "Active") {
    return {
      message: "Your organisation is not active - Please contact your admin if you need help",
      checkPassed: false
    };
  }

  if (userDoc.accountStatus !== "Active") {
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
      "_id organisationId staffId roleId uniqueTabAccess searchText accountStatus accountEmail accountName createdAt updatedAt"
    )
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate([{ path: "staffId" }, { path: "roleId" }]);
    totalCount = await Account.countDocuments({ ...query, organisationId: orgId });
  } else {
    users = await Account.find(
      { ...query, organisationId: orgId, staffId: { $ne: selfId } },
      "_id organisationId staffId roleId uniqueTabAccess searchText accountStatus accountEmail accountName createdAt updatedAt"
    )
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate([{ path: "staffId" }, { path: "roleId" }]);
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
    .populate([{ path: "accountId", populate: [{ path: "staffId" }, { path: "roleId" }] }, { path: "recordId" }]);
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

export const fetchBillings = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const billings = await Billing.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1);
  const totalCount = await Billing.countDocuments({ ...query, organisationId: orgId });

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
    staffProfiles = await Staff.find({ organisationId: orgId }).sort({ _id: -1 });
  } else {
    staffProfiles = await Staff.find({ organisationId: orgId, staffCustomId: { $ne: selfId } }).sort({ _id: -1 });
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
      .limit(limit + 1);
    totalCount = await Staff.countDocuments({ ...query, organisationId: orgId });
  } else {
    staffProfiles = await Staff.find({ ...query, organisationId: orgId, staffCustomId: { $ne: selfId } })
      .sort({ _id: -1 })
      .limit(limit + 1);
    totalCount = await Staff.countDocuments({ ...query, organisationId: orgId, staffCustomId: { $ne: selfId } });
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
    studentProfiles = await Student.find({ organisationId: orgId }).sort({ _id: -1 });
  } else {
    studentProfiles = await Student.find({ organisationId: orgId, studentCustomId: { $ne: selfId } }).sort({ _id: -1 });
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
      .limit(limit + 1);
    totalCount = await Student.countDocuments({ ...query, organisationId: orgId });
  } else {
    studentProfiles = await Student.find({ ...query, organisationId: orgId, studentCustomId: { $ne: selfId } })
      .sort({ _id: -1 })
      .limit(limit + 1);
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
  const programmes = await Programme.find({ organisationId: orgId }).sort({ _id: -1 });

  if (!programmes) {
    throwError("Error fetching programmes", 500);
  }

  return programmes;
};

export const fetchProgrammes = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const programmes = await Programme.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1);
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
      .limit(limit + 1);
    totalCount = await ProgrammeManager.countDocuments({ ...query, organisationId: orgId });
  } else {
    programmeManagers = await ProgrammeManager.find({
      ...query,
      organisationId: orgId,
      programmeManagerStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1);
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

export const fetchAllCourses = async (orgId: string) => {
  const courses = await Course.find({ organisationId: orgId }).sort({ _id: -1 });

  if (!courses) {
    throwError("Error fetching student profiles", 500);
  }

  return courses;
};

export const fetchCourses = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const courses = await Course.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1);
  const totalCount = await Course.countDocuments({ ...query, organisationId: orgId });

  if (!courses) {
    throwError("Error fetching courses", 500);
  }
  const hasNext = courses.length > limit || cursorType === "prev";

  if (courses.length > limit) {
    courses.pop();
  }
  const chunkCount = courses.length;

  return {
    courses,
    totalCount,
    chunkCount,
    nextCursor: courses[courses.length - 1]?._id,
    prevCursor: courses[0]?._id,
    hasNext
  };
};

export const fetchCourseManagers = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let courseManagers;
  let totalCount;
  if (asWho === "Absolute Admin") {
    courseManagers = await CourseManager.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1);
    totalCount = await CourseManager.countDocuments({ ...query, organisationId: orgId });
  } else {
    courseManagers = await CourseManager.find({
      ...query,
      organisationId: orgId,
      courseManagerStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1);
    totalCount = await CourseManager.countDocuments({
      ...query,
      organisationId: orgId,
      courseManagerStaffId: { $ne: selfId }
    });
  }

  if (!courseManagers) {
    throwError("Error fetching course managers", 500);
  }
  const hasNext = courseManagers.length > limit || cursorType === "prev";

  if (courseManagers.length > limit) {
    courseManagers.pop();
  }
  const chunkCount = courseManagers.length;

  return {
    courseManagers,
    totalCount,
    chunkCount,
    nextCursor: courseManagers[courseManagers.length - 1]?._id,
    prevCursor: courseManagers[0]?._id,
    hasNext
  };
};

export const fetchAllLevels = async (orgId: string) => {
  const levels = await Level.find({ organisationId: orgId }).sort({ _id: -1 });

  if (!levels) {
    throwError("Error fetching levels", 500);
  }

  return levels;
};

export const fetchLevels = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const levels = await Level.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1);
  const totalCount = await Level.countDocuments({ ...query, organisationId: orgId });

  if (!levels) {
    throwError("Error fetching levels", 500);
  }
  const hasNext = levels.length > limit || cursorType === "prev";

  if (levels.length > limit) {
    levels.pop();
  }
  const chunkCount = levels.length;

  return {
    levels,
    totalCount,
    chunkCount,
    nextCursor: levels[levels.length - 1]?._id,
    prevCursor: levels[0]?._id,
    hasNext
  };
};

export const fetchLevelManagers = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let levelManagers;
  let totalCount;
  if (asWho === "Absolute Admin") {
    levelManagers = await LevelManager.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1);
    totalCount = await LevelManager.countDocuments({ ...query, organisationId: orgId });
  } else {
    levelManagers = await LevelManager.find({
      ...query,
      organisationId: orgId,
      levelManagerStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1);
    totalCount = await LevelManager.countDocuments({
      ...query,
      organisationId: orgId,
      levelManagerStaffId: { $ne: selfId }
    });
  }

  if (!levelManagers) {
    throwError("Error fetching level managers", 500);
  }
  const hasNext = levelManagers.length > limit || cursorType === "prev";

  if (levelManagers.length > limit) {
    levelManagers.pop();
  }
  const chunkCount = levelManagers.length;

  return {
    levelManagers,
    totalCount,
    chunkCount,
    nextCursor: levelManagers[levelManagers.length - 1]?._id,
    prevCursor: levelManagers[0]?._id,
    hasNext
  };
};

export const fetchAllLevelManagers = async (orgId: string) => {
  const levelManagers = await LevelManager.find({ organisationId: orgId });

  if (!levelManagers) {
    throwError("Error fetching level managers", 500);
  }

  return levelManagers;
};

export const fetchAllCourseManagers = async (orgId: string) => {
  const courseManagers = await CourseManager.find({ organisationId: orgId });

  if (!courseManagers) {
    throwError("Error fetching course managers", 500);
  }

  return courseManagers;
};

export const fetchAllSubjectTeachers = async (orgId: string) => {
  const subjectTeachers = await SubjectTeacher.find({ organisationId: orgId });

  if (!subjectTeachers) {
    throwError("Error fetching course teachers", 500);
  }

  return subjectTeachers;
};

export const fetchAllBaseSubjects = async (orgId: string) => {
  const baseSubjects = await BaseSubject.find({ organisationId: orgId }).sort({ _id: -1 });

  if (!baseSubjects) {
    throwError("Error fetching baseSubjects", 500);
  }

  return baseSubjects;
};

export const fetchBaseSubjects = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const baseSubjects = await BaseSubject.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1);
  const totalCount = await BaseSubject.countDocuments({ ...query, organisationId: orgId });

  if (!baseSubjects) {
    throwError("Error fetching baseSubjects", 500);
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
      .limit(limit + 1);
    totalCount = await BaseSubjectManager.countDocuments({ ...query, organisationId: orgId });
  } else {
    baseSubjectManagers = await BaseSubjectManager.find({
      ...query,
      organisationId: orgId,
      baseSubjectManagerStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1);
    totalCount = await BaseSubjectManager.countDocuments({
      ...query,
      organisationId: orgId,
      baseSubjectManagerStaffId: { $ne: selfId }
    });
  }

  if (!baseSubjectManagers) {
    throwError("Error fetching baseSubject managers", 500);
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
  const topics = await Topic.find({ organisationId: orgId }).sort({ _id: -1 });

  if (!topics) {
    throwError("Error fetching topics", 500);
  }

  return topics;
};

export const fetchTopics = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const topics = await Topic.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1);
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

export const fetchAllSubjects = async (orgId: string) => {
  const subjects = await Subject.find({ organisationId: orgId }).sort({ _id: -1 });

  if (!subjects) {
    throwError("Error fetching subjects", 500);
  }

  return subjects;
};

export const fetchSubjects = async (query: any, cursorType: string, limit: number, orgId: string) => {
  const subjects = await Subject.find({ ...query, organisationId: orgId })
    .sort({ _id: -1 })
    .limit(limit + 1);
  const totalCount = await Subject.countDocuments({ ...query, organisationId: orgId });

  if (!subjects) {
    throwError("Error fetching subjects", 500);
  }
  const hasNext = subjects.length > limit || cursorType === "prev";

  if (subjects.length > limit) {
    subjects.pop();
  }
  const chunkCount = subjects.length;

  return {
    subjects,
    totalCount,
    chunkCount,
    nextCursor: subjects[subjects.length - 1]?._id,
    prevCursor: subjects[0]?._id,
    hasNext
  };
};

export const fetchSubjectTeachers = async (
  query: any,
  cursorType: string,
  limit: number,
  asWho: string,
  orgId: string,
  selfId: string
) => {
  let subjectTeachers;
  let totalCount;
  if (asWho === "Absolute Admin") {
    subjectTeachers = await SubjectTeacher.find({ ...query, organisationId: orgId })
      .sort({ _id: -1 })
      .limit(limit + 1);
    totalCount = await SubjectTeacher.countDocuments({ ...query, organisationId: orgId });
  } else {
    subjectTeachers = await SubjectTeacher.find({
      ...query,
      organisationId: orgId,
      subjectTeacherStaffId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1);
    totalCount = await SubjectTeacher.countDocuments({
      ...query,
      organisationId: orgId,
      subjectTeacherStaffId: { $ne: selfId }
    });
  }

  if (!subjectTeachers) {
    throwError("Error fetching level managers", 500);
  }
  const hasNext = subjectTeachers.length > limit || cursorType === "prev";

  if (subjectTeachers.length > limit) {
    subjectTeachers.pop();
  }
  const chunkCount = subjectTeachers.length;

  return {
    subjectTeachers,
    totalCount,
    chunkCount,
    nextCursor: subjectTeachers[subjectTeachers.length - 1]?._id,
    prevCursor: subjectTeachers[0]?._id,
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
    .limit(limit + 1);
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
      .limit(limit + 1);
    totalCount = await StaffContract.countDocuments({ ...query, organisationId: orgId });
  } else {
    staffContracts = await StaffContract.find({
      ...query,
      organisationId: orgId,
      staffCustomId: { $ne: selfId }
    })
      .sort({ _id: -1 })
      .limit(limit + 1);
    totalCount = await StaffContract.countDocuments({
      ...query,
      organisationId: orgId,
      staffCustomId: { $ne: selfId }
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
    staffContracts = await StaffContract.find({ organisationId: orgId }).sort({ _id: -1 });
  } else {
    staffContracts = await StaffContract.find({ organisationId: orgId, staffCustomId: { $ne: selfId } }).sort({
      _id: -1
    });
  }
  ``;
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
    .limit(limit + 1);
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
    .limit(limit + 1);
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
    .limit(limit + 1);
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
  const studentEnrollments = await StudentEnrollment.find({ organisationId: orgId }).sort({
    _id: -1
  });
  if (!studentEnrollments) {
    throwError("Error fetching student enrollments", 500);
  }

  return studentEnrollments;
};

export const fetchAcademicYears = async (orgId: string) => {
  const academicYears = await AcademicYear.find({ organisationId: orgId }).sort({ _id: -1 }).populate("periods");
  if (!academicYears) {
    throwError("Error fetching academic years", 500);
  }
  return academicYears;
};
