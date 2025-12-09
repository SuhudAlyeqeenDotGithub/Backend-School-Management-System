import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  emitToOrganisation,
  logActivity,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  fetchStudentDayAttendances
} from "../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../utils/pureFuctions.ts";
import { StudentDayAttendanceStore, StudentDayAttendanceTemplate } from "../../models/student/dayattendance.ts";
import { AcademicYear } from "../../models/timeline/academicYear.ts";
import { Course, CourseManager } from "../../models/curriculum/course.ts";
import { Level, LevelManager } from "../../models/curriculum/level.ts";
import { StudentEnrollment } from "../../models/student/enrollment.ts";
import { Staff } from "../../models/staff/profile.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";

const validateStudentDayAttendance = (studentDataParam: any) => {
  const { notes, ...copyLocalData } = studentDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const fetchDayAttendanceStore = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { attendanceId } = req.body;

  // validate input
  if (!attendanceId) {
    throwError("An error occured whilst fetching student day attendance data", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const orgHasRequiredFeature = organisation?.features?.map((feature) => feature.name).includes("Student Attendance");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Attendance to use it",
      403
    );
  }

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Day Attendances (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    tabAccess,
    "View Student Day Attendances (For Level | Course Managers)"
  );

  if (absoluteAdmin || hasAdminAccess || hasManagerAccess) {
    const result = await StudentDayAttendanceStore.find({
      organisationId: userTokenOrgId,
      attendanceId
    });

    if (!result) {
      throwError("Error fetching relevant student day attendance records", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError(
    "Unauthorised Action: You do not have access to view student day attendances - Please contact your admin",
    403
  );
});

export const getEnrolledDayAttendanceStudents = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { academicYearId, courseId, levelId } = req.body;

  // validate input
  if (!academicYearId || !courseId || !levelId) {
    throwError("Please fill in all required fields - Academic Year, Course and Level", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const orgHasRequiredFeature = organisation?.features?.map((feature) => feature.name).includes("Student Attendance");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Attendance to use it",
      403
    );
  }

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Day Attendances (Admin Access)");

  const isStaff = await Staff.findOne({ _id: staffId });
  if (!isStaff && !absoluteAdmin) {
    throwError("Unauthorised Action: We could not find your staff details", 403);
  }

  const staffIsActiveCourseManager = await CourseManager.findOne({
    organisationId: userTokenOrgId,
    courseId,
    courseManagerCustomStaffId: isStaff?.staffCustomId,
    status: "Active"
  });
  const staffIsActiveLevelManager = await LevelManager.findOne({
    organisationId: userTokenOrgId,
    levelId,
    levelManagerCustomStaffId: isStaff?.staffCustomId,
    status: "Active"
  });

  if (!absoluteAdmin && !hasAdminAccess && !staffIsActiveCourseManager && !staffIsActiveLevelManager) {
    throwError(
      "Unauthorised Action: You do not have access to create student day attendance for this course / level or any other course / level - Please contact your admin",
      403
    );
  }

  if (absoluteAdmin || hasAdminAccess || staffIsActiveCourseManager || staffIsActiveLevelManager) {
    const result = await StudentEnrollment.find(
      {
        organisationId: userTokenOrgId,
        courseId,
        levelId,
        academicYearId
      },
      "_id studentId studentCustomId studentFullName"
    );

    if (!result) {
      throwError("Error fetching relevant enrolled student records", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 5 + result.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          result,
          staffIsActiveLevelManager,
          staffIsActiveCourseManager,
          organisation,
          role,
          account
        ])
      }
    ]);

    res.status(201).json(result);
    return;
  }

  throwError(
    "Unauthorised Action: You do not have access to view student day attendances - Please contact your admin",
    403
  );
});

export const getStudentDayAttendances = asyncHandler(async (req: Request, res: Response) => {
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
  const orgHasRequiredFeature = organisation?.features?.map((feature) => feature.name).includes("Student Attendance");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Attendance to use it",
      403
    );
  }

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Day Attendances (Admin Access)");

  let courseManagementDocs;
  let levelManagementDocs;

  if (!absoluteAdmin && !hasAdminAccess) {
    courseManagementDocs = await CourseManager.find({
      organisationId: userTokenOrgId,
      courseManagerStaffId: staffId,
      status: "Active"
    });
    levelManagementDocs = await LevelManager.find({
      organisationId: userTokenOrgId,
      levelManagerStaffId: staffId,
      status: "Active"
    });

    let coursesManaged: any = [];
    if (courseManagementDocs && courseManagementDocs.length > 0) {
      coursesManaged = courseManagementDocs.map((doc) => doc.courseId);
    }

    let levelsManaged: any = [];
    if (levelManagementDocs && levelManagementDocs.length > 0) {
      levelsManaged = levelManagementDocs.map((doc) => doc.levelId);
    }

    query["$or"] = [{ courseId: { $in: coursesManaged } }, { levelId: { $in: levelsManaged } }];
  }

  const result = await fetchStudentDayAttendances(
    query,
    cursorType as string,
    parsedLimit,
    organisation!._id.toString()
  );

  if (!result || !result.studentDayAttendances) {
    throwError("Error fetching student day attendances", 500);
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value:
        3 +
        result.studentDayAttendances.length +
        (courseManagementDocs ? courseManagementDocs.length : 0) +
        (levelManagementDocs ? levelManagementDocs.length : 0)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, courseManagementDocs, levelManagementDocs, organisation, role, account])
    }
  ]);
  res.status(201).json(result);
  return;
});

// // controller to handle role creation
export const createStudentDayAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const {
    attendanceCustomId,
    academicYearId,
    academicYear,
    courseId,
    attendanceStatus,
    attendanceDate,
    courseCustomId,
    courseFullTitle,
    courseManagerStaffId,
    courseManagerCustomStaffId,
    courseManagerFullName,
    levelManagerStaffId,
    levelManagerCustomStaffId,
    levelManagerFullName,
    levelId,
    levelCustomId,
    level
  } = req.body;

  const { studentDayAttendances, ...rest } = req.body;

  if (studentDayAttendances.length === 0) {
    throwError(
      "You cannot create an empty student day attendance - Please load students or come back to create this when you are ready",
      400
    );
  }

  if (!validateStudentDayAttendance({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const orgHasRequiredFeature = organisation?.features?.map((feature) => feature.name).includes("Student Attendance");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Attendance to use it",
      403
    );
  }

  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Day Attendance (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    creatorTabAccess,
    "Create Student Day Attendance (For Level | Course Managers)"
  );
  if (!absoluteAdmin && !hasAdminAccess && !hasManagerAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create student day attendance for this course / level or any other course / level - Please contact your admin",
      403
    );
  }

  const attendanceExists = await StudentDayAttendanceTemplate.findOne({
    organisationId: orgParsedId,
    attendanceCustomId
  });
  if (attendanceExists) {
    throwError(
      "An attendance with this custom id already exists - Either refer to that record or change the custom id",
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
      "This course does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const levelExists = await Level.findOne({ organisationId: orgParsedId, levelCustomId });
  if (!levelExists) {
    throwError(
      "This level does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const courseManagerExists = await CourseManager.findOne({
    organisationId: orgParsedId,
    courseId,
    courseManagerCustomStaffId
  });
  if (!courseManagerExists) {
    throwError(
      "This course manager does not have a management record related to this course- Ensure you have created one for them",
      409
    );
  }

  const levelManagerExists = await LevelManager.findOne({
    organisationId: orgParsedId,
    levelId,
    levelManagerCustomStaffId
  });
  if (!levelManagerExists) {
    throwError(
      "This level manager does not have a management record related to this level- Ensure you have created one for them",
      409
    );
  }

  const attendance = await StudentDayAttendanceTemplate.create({
    ...rest,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      attendanceCustomId,
      courseFullTitle,
      level,
      courseId,
      levelId,
      courseCustomId,
      levelCustomId,
      attendanceStatus,
      academicYear,
      academicYearId,
      attendanceDate,
      courseManagerStaffId,
      courseManagerCustomStaffId,
      courseManagerFullName,
      levelManagerStaffId,
      levelManagerCustomStaffId,
      levelManagerFullName
    ])
  });

  if (!attendance) {
    throwError("Error creating student day attendance template", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Attendance Creation",
      "StudentDayAttendanceTemplate",
      attendance?._id,
      `${attendanceDate} - ${attendanceCustomId} - ${courseFullTitle} - ${level}`,
      [
        {
          kind: "N",
          rhs: attendance
        }
      ],
      new Date()
    );
  }

  let mappedAttendances: any = [];
  let studentAttendances;

  if (studentDayAttendances.length > 0) {
    mappedAttendances = studentDayAttendances.map((studentDayAttendance: any) => ({
      ...studentDayAttendance,
      organisationId: orgParsedId,
      attendanceCustomId,
      attendanceId: attendance?._id,
      academicYearId,
      academicYear,
      courseId,
      courseFullTitle,
      levelId,
      level,
      attendanceDate,
      studentId: studentDayAttendance.studentId,
      studentCustomId: studentDayAttendance.studentCustomId,
      studentFullName: studentDayAttendance.studentFullName
    }));
    studentAttendances = await StudentDayAttendanceStore.insertMany(mappedAttendances, { ordered: true });
    if (!studentAttendances) {
      throwError(
        "Error creating student day attendance - However the student day attendance template was created - close this dialog and try again by editing the created template",
        500
      );
    }
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 11 + (logActivityAllowed ? 2 : 0) + mappedAttendances.length * 2 },
    {
      field: "databaseStorageAndBackup",
      value:
        (getObjectSize([attendance, studentAttendances]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([
          mappedAttendances,
          attendance,
          attendanceExists,
          levelManagerExists,
          courseManagerExists,
          academicYearExists,
          levelExists,
          courseExists,
          organisation,
          role,
          account
        ]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});

// controller to handle role update
export const updateStudentDayAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const {
    attendanceCustomId,
    academicYearId,
    academicYear,
    courseId,
    attendanceStatus,
    attendanceDate,
    courseCustomId,
    courseFullTitle,
    courseManagerStaffId,
    courseManagerCustomStaffId,
    courseManagerFullName,
    levelManagerStaffId,
    levelManagerCustomStaffId,
    levelManagerFullName,
    levelId,
    levelCustomId,
    level
  } = req.body;

  const { studentDayAttendances, ...rest } = req.body;

  if (!validateStudentDayAttendance({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const orgHasRequiredFeature = organisation?.features?.map((feature) => feature.name).includes("Student Attendance");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Attendance to use it",
      403
    );
  }

  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Day Attendance (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    creatorTabAccess,
    "Create Student Day Attendance (For Level | Course Managers)"
  );
  if (!absoluteAdmin && !hasAdminAccess && !hasManagerAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create student day attendance for this course / level or any other course / level - Please contact your admin",
      403
    );
  }

  const attendanceExists = await StudentDayAttendanceTemplate.findOne({
    organisationId: orgParsedId,
    attendanceCustomId
  });

  if (!attendanceExists) {
    throwError(
      "An error occured whilst getting this student day attendance template - Please ensure this attendance exists with the correct Id",
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

  const courseManagerExists = await CourseManager.findOne({
    organisationId: orgParsedId,
    courseId,
    courseManagerCustomStaffId
  });
  if (!courseManagerExists) {
    throwError(
      "This course manager does not have a management record related to this course- Ensure you have created one for them",
      409
    );
  }

  const levelManagerExists = await LevelManager.findOne({
    organisationId: orgParsedId,
    levelId,
    levelManagerCustomStaffId
  });
  if (!levelManagerExists) {
    throwError(
      "This level manager does not have a management record related to this level- Ensure you have created one for them",
      409
    );
  }

  const updatedStudentDayAttendance = await StudentDayAttendanceTemplate.findByIdAndUpdate(
    attendanceExists?._id,
    {
      ...rest,
      searchText: generateSearchText([
        attendanceCustomId,
        courseFullTitle,
        level,
        courseId,
        levelId,
        courseCustomId,
        levelCustomId,
        attendanceStatus,
        academicYear,
        academicYearId,
        attendanceDate,
        courseManagerStaffId,
        courseManagerCustomStaffId,
        courseManagerFullName,
        levelManagerStaffId,
        levelManagerCustomStaffId,
        levelManagerFullName
      ])
    },
    { new: true }
  );

  if (!updatedStudentDayAttendance) {
    throwError("Error updating student day attendance template", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(attendanceExists, updatedStudentDayAttendance);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Attendance Update",
      "StudentDayAttendanceTemplate",
      updatedStudentDayAttendance?._id,
      `${attendanceDate} - ${attendanceCustomId} - ${courseFullTitle} - ${level}`,
      difference,
      new Date()
    );
  }

  let mappedAttendances: any = [];
  let studentAttendances;

  if (studentDayAttendances.length > 0) {
    mappedAttendances = studentDayAttendances.map((studentDayAttendance: any) =>
      studentDayAttendance._id && studentDayAttendance.organisationId
        ? studentDayAttendance
        : {
            ...studentDayAttendance,
            organisationId: orgParsedId,
            attendanceCustomId,
            attendanceId: attendanceExists?._id,
            academicYearId,
            academicYear,
            courseId,
            courseFullTitle,
            levelId,
            level,
            attendanceDate,
            studentId: studentDayAttendance.studentId,
            studentCustomId: studentDayAttendance.studentCustomId,
            studentFullName: studentDayAttendance.studentFullName
          }
    );

    const bulkUpdates = mappedAttendances.map((studentDayAttendance: any) => {
      const filter = studentDayAttendance._id
        ? { _id: studentDayAttendance._id, studentId: studentDayAttendance.studentId }
        : { studentId: studentDayAttendance.studentId };
      return {
        updateOne: {
          filter: filter,
          update: {
            $set: {
              ...studentDayAttendance,
              attendance: studentDayAttendance.attendance
            }
          },
          upsert: true
        }
      };
    });

    studentAttendances = await StudentDayAttendanceStore.bulkWrite(bulkUpdates, { ordered: true });
    if (!studentAttendances) {
      throwError(
        "Error updating student day attendances - However the student day attendance template was updated - close this dialog and try again by editing the created template",
        500
      );
    }
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 11 + (logActivityAllowed ? 2 : 0) + mappedAttendances.length * 2 },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([
          mappedAttendances,
          updatedStudentDayAttendance,
          attendanceExists,
          levelManagerExists,
          courseManagerExists,
          levelExists,
          courseExists,
          academicYearExists,
          organisation,
          role,
          account
        ]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});

// controller to handle deleting roles
export const deleteStudentDayAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { studentDayAttendanceIDToDelete } = req.body;
  if (!studentDayAttendanceIDToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const orgHasRequiredFeature = organisation?.features?.map((feature) => feature.name).includes("Student Attendance");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Attendance to use it",
      403
    );
  }

  const { roleId: creatorRoleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Day Attendance (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    creatorTabAccess,
    "Create Student Day Attendance (For Level | Course Managers)"
  );
  if (!absoluteAdmin && !hasAdminAccess && !hasManagerAccess) {
    throwError(
      "Unauthorised Action: You do not have access to delete student day attendance - Please contact your admin",
      403
    );
  }

  const StudentDayAttendanceToDelete = await StudentDayAttendanceTemplate.findById(studentDayAttendanceIDToDelete);

  if (!StudentDayAttendanceToDelete) {
    throwError("Error finding student day attendance template - Please try again", 404);
  }

  const deletedStudentDayAttendanceStore = await StudentDayAttendanceStore.deleteMany({
    attendanceId: studentDayAttendanceIDToDelete
  });

  if (!deletedStudentDayAttendanceStore) {
    throwError("Error deleting student day attendance - Please try again", 500);
  }

  const deletedStudentDayAttendance = await StudentDayAttendanceTemplate.findByIdAndDelete(
    studentDayAttendanceIDToDelete
  );
  if (!deletedStudentDayAttendance) {
    throwError("Error deleting student day attendance template - Please try again", 500);
  }

  const emitRoom = deletedStudentDayAttendance?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "studentdayattendancetemplates", deletedStudentDayAttendance, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Attendance Delete",
      "StudentDayAttendanceTemplate",
      deletedStudentDayAttendance?._id,
      deletedStudentDayAttendance?._id.toString(),
      [
        {
          kind: "D" as any,
          lhs: deletedStudentDayAttendance
        }
      ],
      new Date()
    );
  }

  let oneRecordSize = 0.0000006;

  const foundRecord = await StudentDayAttendanceStore.findOne({ attendanceId: studentDayAttendanceIDToDelete });

  if (foundRecord) {
    oneRecordSize = getObjectSize(foundRecord);
  }

  await StudentDayAttendanceStore.findOne({ attendanceId: studentDayAttendanceIDToDelete });

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 7 + (logActivityAllowed ? 2 : 0) + deletedStudentDayAttendanceStore.deletedCount * 2
    },
    {
      field: "databaseStorageAndBackup",
      value:
        toNegative(getObjectSize(deletedStudentDayAttendance) * 2) +
        toNegative(getObjectSize(oneRecordSize) * deletedStudentDayAttendanceStore.deletedCount * 2) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([
          deletedStudentDayAttendance,
          organisation,
          role,
          account,
          StudentDayAttendanceToDelete,
          foundRecord
        ]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});
