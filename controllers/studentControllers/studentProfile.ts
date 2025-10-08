import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../models/admin/accountModel";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchStudentProfiles,
  generateCustomId,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  validateEmail,
  validatePhoneNumber,
  fetchAllStudentProfiles
} from "../../utils/utilsFunctions";
import { logActivity } from "../../utils/utilsFunctions";
import { diff } from "deep-diff";

import { Student } from "../../models/student/studentProfile";

const validateStudentProfile = (studentDataParam: any) => {
  const {
    studentImageUrl,
    imageLocalDestination,
    studentQualification,
    workExperience,
    identification,
    skills,
    studentPostCode,
    studentEndDate,
    ...copyLocalData
  } = studentDataParam;

  if (!validateEmail(studentDataParam.studentEmail)) {
    throwError("Please enter a valid email address.", 400);
    return;
  }

  if (!validatePhoneNumber(studentDataParam.studentPhone)) {
    throwError("Please enter a valid phone number with the country code. e.g +234, +447", 400);
    return;
  }

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

  const { roleId, accountStatus, studentId } = account as any;
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
    res.status(201).json(studentProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view student profile - Please contact your admin", 403);
});

export const getStudentProfiles = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { search = "", limit, cursorType, nextCursor, prevCursor, ...filters } = req.query;

  const parsedLimit = parseInt(limit as string);
  const query: any = {};

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

  const { roleId, accountStatus, studentId } = account as any;
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
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view student profile - Please contact your admin", 403);
});

// controller to handle role creation
export const createStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const {
    studentCustomId,
    studentFullName,
    studentDateOfBirth,
    studentGender,
    studentPhone,
    studentEmail,
    studentAddress,
    studentPostCode,
    studentImageUrl,
    imageLocalDestination,
    studentMaritalStatus,
    studentStartDate,
    studentEndDate,
    studentNationality,
    studentAllergies,
    studentNextOfKinName,
    studentNextOfKinRelationship,
    studentNextOfKinPhone,
    studentNextOfKinEmail,
    studentQualification,
    workExperience,
    identification,
    skills
  } = body;

  if (!validateStudentProfile(body)) {
    throwError("Please fill in all required fields", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const usedEmail = await Account.findOne({ studentEmail, organisationId: orgParsedId });
  if (usedEmail) {
    throwError("This email is already in use by another student member - Please use a different email", 409);
  }

  const studentExists = await Student.findOne({ organisationId: orgParsedId, studentCustomId });
  if (studentExists) {
    throwError(
      "A student with this Custom Id already exist - Either refer to that record or change the student custom Id",
      409
    );
  }

  const { roleId, accountStatus, accountName, studentId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Student Profile");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create student - Please contact your admin", 403);
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

  await logActivity(
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
    studentPhone,
    studentEmail,
    studentAddress,
    studentPostCode,
    studentImageUrl,
    imageLocalDestination,
    studentMaritalStatus,
    studentStartDate,
    studentEndDate,
    studentNationality,
    studentAllergies,
    studentNextOfKinName,
    studentNextOfKinRelationship,
    studentNextOfKinPhone,
    studentNextOfKinEmail,
    studentQualification,
    workExperience,
    identification,
    skills
  } = body;

  if (!validateStudentProfile(body)) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!.toString();

  const { roleId, accountStatus, studentId } = account as any;
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

  const difference = diff(originalStudent, updatedStudent);

  await logActivity(
    account?.organisationId,
    accountId,
    "Student Profile Update",
    "Student",
    updatedStudent?._id,
    studentFullName,
    difference,
    new Date()
  );

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

  const { roleId: creatorRoleId, accountStatus } = account as any;

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

  await logActivity(
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
  res.status(201).json("successfull");
});
