import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchStudentEnrollments,
  emitToOrganisation,
  logActivity,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  fetchAllStudentEnrollments
} from "../../utils/utilsFunctions.ts";

import { diff } from "deep-diff";
import { Student } from "../../models/student/studentProfile.ts";
import { StudentEnrollment } from "../../models/student/enrollment.ts";
import { AcademicYear } from "../../models/timeline/academicYear.ts";
import { Course } from "../../models/curriculum/course.ts";
import { Level } from "../../models/curriculum/level.ts";

const validateStudentEnrollment = (studentDataParam: any) => {
  const { enrollmentExpiresOn, notes, allowances, ...copyLocalData } = studentDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getStudentEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

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

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  // confirm role
  await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus, studentId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Student Enrollments");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchStudentEnrollments(
      query,
      cursorType as string,
      parsedLimit,
      organisation!._id.toString()
    );

    if (!result || !result.studentEnrollments) {
      throwError("Error fetching student enrollments", 500);
    }
    deleteStudentEnrollment;

    res.status(201).json(result);
    return;
  }

  throwError(
    "Unauthorised Action: You do not have access to view student enrollments - Please contact your admin",
    403
  );
});

export const getAllStudentEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  // confirm role
  await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus, studentId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Student Enrollments");

  if (absoluteAdmin || hasAccess) {
    const studentEnrollments = await fetchAllStudentEnrollments(organisation!._id.toString());

    if (!studentEnrollments) {
      throwError("Error fetching student enrollments", 500);
    }
    deleteStudentEnrollment;

    res.status(201).json(studentEnrollments);
    return;
  }

  throwError(
    "Unauthorised Action: You do not have access to view student enrollments - Please contact your admin",
    403
  );
});
// controller to handle role creation
export const createStudentEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const {
    academicYearId,
    academicYear,
    studentId,
    studentCustomId,
    enrollmentCustomId,
    studentFullName,
    enrollmentType,
    enrollmentStatus,
    courseId,
    courseCustomId,
    courseFullTitle,
    levelId,
    levelCustomId,
    level
  } = req.body;

  if (!validateStudentEnrollment({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId, accountStatus, studentId: userStudentId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Student Enrollment");

  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create student enrollment - Please contact your admin",
      403
    );
  }

  const enrollementExist = await StudentEnrollment.findOne({ organisationId: orgParsedId, enrollmentCustomId });
  if (enrollementExist) {
    throwError("This enrollment custom ID is already being used. Please use a different enrollment custom ID", 409);
  }

  const studentExists = await Student.findOne({ organisationId: orgParsedId, studentCustomId });
  if (!studentExists) {
    throwError(
      "This student ID does not exist. Please provide the user student Custom ID related to their student record - or create one for them",
      409
    );
  }

  const academicYearExists = await AcademicYear.findOne({ organisationId: orgParsedId, academicYear });
  if (!academicYearExists) {
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const courseExists = await Course.findOne({ organisationId: orgParsedId, courseCustomId });
  if (!courseExists) {
    throwError(
      "No course with the provided Custom Id exist - Please create the course or change the course custom Id",
      409
    );
  }

  const levelExists = await Level.findOne({ organisationId: orgParsedId, levelCustomId });
  if (!levelExists) {
    throwError(
      "No level with the provided Custom Id exist - Please create the level or change the level custom Id",
      409
    );
  }

  const newStudentEnrollment = await StudentEnrollment.create({
    ...req.body,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      academicYearId,
      academicYear,
      studentId,
      studentCustomId,
      enrollmentCustomId,
      studentFullName,
      courseId,
      courseCustomId,
      courseFullTitle,
      levelId,
      levelCustomId,
      level,
      enrollmentStatus,
      enrollmentType
    ])
  });

  if (!newStudentEnrollment) {
    throwError("Error creating student enrollment", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Enrollment Creation",
      "StudentEnrollment",
      newStudentEnrollment?._id,
      studentFullName + " " + "Enrollment",
      [
        {
          kind: "N",
          rhs: newStudentEnrollment
        }
      ],
      new Date()
    );
  }

  res.status(201).json("successful");
});

// controller to handle role update
export const updateStudentEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const {
    academicYearId,
    academicYear,
    studentId,
    studentCustomId,
    enrollmentCustomId,
    studentFullName,
    enrollmentType,
    enrollmentStatus,
    courseId,
    courseCustomId,
    courseFullTitle,
    levelId,
    levelCustomId,
    level
  } = req.body;

  if (!validateStudentEnrollment({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Student Enrollment");

  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to edit student enrollment - Please contact your admin",
      403
    );
  }

  const originalStudentEnrollment = await StudentEnrollment.findOne({
    organisationId: orgParsedId,
    enrollmentCustomId
  });

  if (!originalStudentEnrollment) {
    throwError(
      "An error occured whilst getting old student enrollment data - Please ensure this enrollment exists with the correct Id",
      500
    );
  }

  const academicYearExists = await AcademicYear.findOne({ organisationId: orgParsedId, academicYear });
  if (!academicYearExists) {
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const courseExists = await Course.findOne({ organisationId: orgParsedId, courseCustomId });
  if (!courseExists) {
    throwError(
      "No course with the provided Custom Id exist - Please create the course or change the course custom Id",
      409
    );
  }

  const levelExists = await Level.findOne({ organisationId: orgParsedId, levelCustomId });
  if (!levelExists) {
    throwError(
      "No level with the provided Custom Id exist - Please create the level or change the level custom Id",
      409
    );
  }

  const updatedStudentEnrollment = await StudentEnrollment.findByIdAndUpdate(
    originalStudentEnrollment?._id,
    {
      ...req.body,
      searchText: generateSearchText([
        academicYearId,
        academicYear,
        studentId,
        studentCustomId,
        enrollmentCustomId,
        studentFullName,
        courseId,
        courseCustomId,
        courseFullTitle,
        levelId,
        levelCustomId,
        level,
        enrollmentStatus,
        enrollmentType
      ])
    },
    { new: true }
  );

  if (!updatedStudentEnrollment) {
    throwError("Error updating student enrollment", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalStudentEnrollment, updatedStudentEnrollment);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Enrollment Update",
      "StudentEnrollment",
      updatedStudentEnrollment?._id,
      studentFullName,
      difference,
      new Date()
    );
  }
  res.status(201).json("successful");
});

// controller to handle deleting roles
export const deleteStudentEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { studentEnrollmentIDToDelete } = req.body;
  if (!studentEnrollmentIDToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Student Enrollment");

  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to delete student enrollment - Please contact your admin",
      403
    );
  }

  const StudentEnrollmentToDelete = await StudentEnrollment.findById(studentEnrollmentIDToDelete);

  if (!StudentEnrollmentToDelete) {
    throwError("Error finding student enrollment - Please try again", 404);
  }

  const deletedStudentEnrollment = await StudentEnrollment.findByIdAndDelete(studentEnrollmentIDToDelete);
  if (!deletedStudentEnrollment) {
    throwError("Error deleting student enrollment - Please try again", 500);
  }

  const emitRoom = deletedStudentEnrollment?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "studentenrollments", deletedStudentEnrollment, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Enrollment Delete",
      "StudentEnrollment",
      deletedStudentEnrollment?._id,
      deletedStudentEnrollment?._id.toString(),
      [
        {
          kind: "D" as any,
          lhs: deletedStudentEnrollment
        }
      ],
      new Date()
    );
  }

  res.status(201).json("successful");
});
