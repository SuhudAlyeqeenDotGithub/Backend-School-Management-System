import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchStudentEnrollments,
  emitToOrganisation,
  logActivity,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  fetchAllStudentEnrollments,
  orgHasRequiredFeature,
  checkAccesses
} from "../../utils/databaseFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../utils/pureFuctions.ts";
import { diff } from "deep-diff";
import { Student } from "../../models/student/studentProfile.ts";
import { StudentEnrollment } from "../../models/student/enrollment.ts";
import { AcademicYear } from "../../models/timeline/academicYear.ts";
import { Class } from "../../models/curriculum/class.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { getNeededAccesses } from "../../utils/defaultVariables.ts";

const validateStudentEnrollment = (studentDataParam: any) => {
  const {
    enrollmentExpiresOn,
    notes,
    allowances,
    completionStatus,
    awardingBody,
    qualification,
    progressionOutcome,
    pathwayId,
    studentFullName,
    pathway,
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

export const getStudentEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  const { search = "", limit, cursorType, nextCursor, prevCursor, ...filters } = req.query;
  const parsedLimit = parseInt(limit as string);

  const query: any = { organisationId: userTokenOrgId };
  if (search) {
    query.searchText = { $regex: search, $options: "i" };
  }

  for (const key in filters) {
    if (filters[key] !== "all" && filters[key] && filters[key] !== "undefined" && filters[key] !== "null") {
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
  const featureCheckPassed = orgHasRequiredFeature(organisation, "Student Profile & Enrollment");
  if (!featureCheckPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Profile & Enrollment to use it",
      403
    );
  }

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.studentEnrollments.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);

    res.status(201).json(result);
    return;
  }

  throwError(
    "Unauthorised Action: You do not have access to view student enrollments or one of it's required data (student profiles, programmes, classes, academic years, pathways) - Please contact your admin",
    403
  );
});

export const getAllStudentEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const featureCheckPassed = orgHasRequiredFeature(organisation, "Student Profile & Enrollment");
  if (!featureCheckPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Profile & Enrollment to use it",
      403
    );
  }

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccesses(account, tabAccess, getNeededAccesses("All Student Enrollments"));

  if (absoluteAdmin || hasAccess) {
    const studentEnrollments = await fetchAllStudentEnrollments(organisation!._id.toString());

    if (!studentEnrollments) {
      throwError("Error fetching student enrollments", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + studentEnrollments.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([studentEnrollments, organisation, role, account])
      }
    ]);

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
  const { accountId } = req.userToken;
  const { academicYearId, customId, studentId, fullName, pathwayId, classId, programmeId } = req.body;

  if (!validateStudentEnrollment({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const featureCheckPassed = orgHasRequiredFeature(organisation, "Student Profile & Enrollment");
  if (!featureCheckPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Profile & Enrollment to use it",
      403
    );
  }
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Student Enrollment");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to create student enrollment - Please contact your admin",
      403
    );
  }

  const enrollementExists = await StudentEnrollment.findOne({ organisationId: orgParsedId, customId }).lean();
  if (enrollementExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, enrollementExists]) }
    ]);
    throwError("This enrollment custom ID is already being used. Please use a different enrollment custom ID", 409);
  }

  const studentExists = await Student.findById(studentId).lean();
  if (!studentExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, enrollementExists]) }
    ]);
    throwError("This student does not exist. Please select a valid student or create a new student", 409);
  }

  const academicYearExists = await AcademicYear.findById(academicYearId).lean();
  if (!academicYearExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, enrollementExists, academicYearExists])
      }
    ]);
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const classExists = await Class.findById(classId).lean();
  if (!classExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, enrollementExists, academicYearExists])
      }
    ]);
    throwError("This class does not exist  - Please create the class or select another class", 409);
  }

  const newStudentEnrollment = await StudentEnrollment.create({
    ...req.body,
    organisationId: orgParsedId,
    pathwayId: pathwayId ? pathwayId : null,
    searchText: generateSearchText([academicYearId, studentId, pathwayId, programmeId, classId])
  });

  if (!newStudentEnrollment) {
    registerBillings(req, [
      { field: "databaseOperation", value: 9 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, enrollementExists, academicYearExists, classExists])
      }
    ]);
    throwError("Error creating student enrollment", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Student Enrollment Creation",
      "StudentEnrollment",
      newStudentEnrollment?._id,
      fullName + " " + "Enrollment",
      [
        {
          kind: "N",
          rhs: newStudentEnrollment
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 9 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: getObjectSize(newStudentEnrollment) * 2
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([
        newStudentEnrollment,
        academicYearExists,
        studentExists,
        enrollementExists,
        classExists,
        organisation,
        role,
        account
      ])
    }
  ]);

  res.status(201).json("successful");
});

// controller to handle role update
export const updateStudentEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { academicYearId, studentId, fullName, classId, pathwayId, programmeId, _id } = req.body;

  if (!validateStudentEnrollment({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const featureCheckPassed = orgHasRequiredFeature(organisation, "Student Profile & Enrollment");
  if (!featureCheckPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Profile & Enrollment to use it",
      403
    );
  }

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Student Enrollment");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to edit student enrollment - Please contact your admin",
      403
    );
  }

  const academicYearExists = await AcademicYear.findById(academicYearId).lean();
  if (!academicYearExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const classExists = await Class.findById(classId).lean();
  if (!classExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, academicYearExists]) }
    ]);
    throwError(
      "No class with the provided Custom Id exist - Please create the class or change the class custom Id",
      409
    );
  }
  const originalStudentEnrollment = await StudentEnrollment.findById(_id).lean();

  if (!originalStudentEnrollment) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, academicYearExists, classExists])
      }
    ]);
    throwError(
      "An error occured whilst getting old student enrollment data - Please ensure this enrollment exists with the correct Id",
      500
    );
  }

  const updatedStudentEnrollment = await StudentEnrollment.findByIdAndUpdate(
    originalStudentEnrollment?._id,
    {
      ...req.body,
      pathwayId: pathwayId ? pathwayId : null,
      searchText: generateSearchText([academicYearId, studentId, pathwayId, programmeId, classId])
    },
    { new: true }
  ).lean();

  if (!updatedStudentEnrollment) {
    registerBillings(req, [
      { field: "databaseOperation", value: 8 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          updatedStudentEnrollment,
          academicYearExists,
          classExists,
          organisation,
          role,
          account,
          originalStudentEnrollment
        ])
      }
    ]);
    throwError("Error updating student enrollment", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalStudentEnrollment, updatedStudentEnrollment);
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Student Enrollment Update",
      "StudentEnrollment",
      updatedStudentEnrollment?._id,
      fullName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 8 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([
        updatedStudentEnrollment,
        academicYearExists,
        classExists,
        organisation,
        role,
        account,
        originalStudentEnrollment
      ])
    }
  ]);
  res.status(201).json("successful");
});

// controller to handle deleting roles
export const deleteStudentEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { studentEnrollmentIDToDelete } = req.body;
  if (!studentEnrollmentIDToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const featureCheckPassed = orgHasRequiredFeature(organisation, "Student Profile & Enrollment");
  if (!featureCheckPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Profile & Enrollment to use it",
      403
    );
  }

  const { roleId: creatorRoleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Student Enrollment");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
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

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 6 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: toNegative(getObjectSize(deletedStudentEnrollment) * 2)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([deletedStudentEnrollment, organisation, role, account, StudentEnrollmentToDelete])
    }
  ]);

  res.status(201).json("successful");
});
