import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  getObjectSize,
  toNegative,
  throwError,
  generateSearchText,
  fetchStudentProfiles,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllStudentProfiles
} from "../../utils/utilsFunctions";
import { logActivity } from "../../utils/utilsFunctions";
import { diff } from "deep-diff";

import { Student } from "../../models/student/studentProfile";
import { registerBillings } from "../../utils/billingFunctions.ts";

const validateStudentProfile = (studentDataParam: any) => {
  const {
    studentImageUrl,
    imageLocalDestination,
    studentQualification,
    workExperience,
    identification,
    skills,
    studentEmail,
    studentPhone,
    studentPostCode,
    studentEndDate,
    ...copyLocalData
  } = studentDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllStudentProfiles = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, studentId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Student Profiles");

  if (absoluteAdmin || hasAccess) {
    const studentProfiles = await fetchAllStudentProfiles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      absoluteAdmin ? "" : studentId.studentCustomId.toString()
    );

    if (!studentProfiles) {
      throwError("Error fetching student profiles", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + studentProfiles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([studentProfiles, organisation, role, account])
      }
    ]);
    res.status(201).json(studentProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view student profile - Please contact your admin", 403);
});

export const getStudentProfiles = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { search = "", limit, cursorType, nextCursor, prevCursor, ...filters } = req.query;

  const parsedLimit = parseInt(limit as string);

  const query: any = { organisationId: userTokenOrgId };
  if (search) {
    query.searchText = { $regex: search, $options: "i" };
  }

  for (const key in filters) {
    if (filters[key] !== "all") {
      query[key] = filters[key];
    }
  }

  if (cursorType) {
    if (nextCursor && cursorType === "next") {
      query._id = { $lt: nextCursor };
    } else if (prevCursor && cursorType === "prev") {
      query._id = { $gt: prevCursor };
    }
  }

  const { roleId, studentId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Student Profiles");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchStudentProfiles(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      absoluteAdmin ? "" : studentId.studentCustomId.toString()
    );

    if (!result || !result.studentProfiles) {
      throwError("Error fetching student profiles", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.studentProfiles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view student profile - Please contact your admin", 403);
});

// controller to handle role creation
export const createStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const {
    studentCustomId,
    studentFullName,
    studentDateOfBirth,
    studentGender,
    studentEmail,
    studentNationality,
    studentNextOfKinName
  } = body;

  if (!validateStudentProfile(body)) {
    throwError("Please fill in all required fields", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Student Profile");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create student - Please contact your admin", 403);
  }

  const studentExists = await Student.findOne({ organisationId: orgParsedId, studentCustomId });
  if (studentExists) {
    throwError(
      "A student with this Custom Id already exist - Either refer to that record or change the student custom Id",
      409
    );
  }

  const newStudent = await Student.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      studentCustomId,
      studentFullName,
      studentGender,
      studentEmail,
      studentDateOfBirth,
      studentNationality,
      studentNextOfKinName
    ])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Profile Creation",
      "Student",
      newStudent?._id,
      studentFullName,
      [
        {
          kind: "N",
          rhs: {
            _id: newStudent._id,
            studentId: newStudent.studentCustomId,
            studentFullName
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newStudent) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newStudent, studentExists, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const {
    studentCustomId,
    studentFullName,
    studentDateOfBirth,
    studentGender,
    studentEmail,
    studentNationality,
    studentNextOfKinName
  } = body;

  if (!validateStudentProfile(body)) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!.toString();

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Student Profile");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit student - Please contact your admin", 403);
  }

  const originalStudent = await Student.findOne({ organisationId: orgParsedId, studentCustomId });

  if (!originalStudent) {
    throwError("An error occured whilst getting old student data", 500);
  }

  const updatedStudent = await Student.findByIdAndUpdate(
    originalStudent?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([
        studentCustomId,
        studentGender,
        studentFullName,
        studentEmail,
        studentDateOfBirth,
        studentNationality,
        studentNextOfKinName
      ])
    },
    { new: true }
  );

  if (!updatedStudent) {
    throwError("Error updating student profile", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalStudent, updatedStudent);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Profile Update",
      "Student",
      updatedStudent?._id,
      studentFullName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedStudent, organisation, role, account, originalStudent]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { studentIDToDelete } = req.body;
  if (!studentIDToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Student Profile");
  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to delete student profile - Please contact your admin",
      403
    );
  }

  const studentProfileToDelete = await Student.findOne({
    studentCustomId: studentIDToDelete,
    organisationId: organisation?._id.toString()
  });

  if (!studentProfileToDelete) {
    throwError("Error finding student profile with provided Custom Id - Please try again", 404);
  }

  const deletedStudentProfile = await Student.findByIdAndDelete(studentProfileToDelete?._id.toString());
  if (!deletedStudentProfile) {
    throwError("Error deleting student profile - Please try again", 500);
  }

  const emitRoom = deletedStudentProfile?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "students", deletedStudentProfile, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Delete",
      "Student",
      deletedStudentProfile?._id,
      deletedStudentProfile?.studentFullName,
      [
        {
          kind: "D" as any,
          lhs: {
            _id: deletedStudentProfile?._id,
            studentCustomId: deletedStudentProfile?.studentCustomId,
            studentFullName: deletedStudentProfile?.studentFullName,
            studentEmail: deletedStudentProfile?.studentEmail,
            studentNextOfKinName: deletedStudentProfile?.studentNextOfKinName,
            studentQualification: deletedStudentProfile?.studentQualification
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 6 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value:
        toNegative(getObjectSize(deletedStudentProfile) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedStudentProfile, organisation, role, account, studentProfileToDelete]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
