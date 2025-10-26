import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  emitToOrganisation,
  logActivity,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  fetchStudentSubjectAttendances
} from "../../utils/utilsFunctions.ts";
import { diff } from "deep-diff";

import {
  StudentSubjectAttendanceStore,
  StudentSubjectAttendanceTemplate
} from "../../models/student/subjectAttendance.ts";
import { AcademicYear } from "../../models/timeline/academicYear.ts";
import { Course, CourseManager } from "../../models/curriculum/course.ts";
import { Level, LevelManager } from "../../models/curriculum/level.ts";
import { StudentEnrollment } from "../../models/student/enrollment.ts";
import { Staff } from "../../models/staff/profile.ts";
import { Subject, SubjectTeacher } from "../../models/curriculum/subject.ts";

const validateStudentSubjectAttendance = (studentDataParam: any) => {
  const { notes, ...copyLocalData } = studentDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const fetchSubjectAttendanceStore = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { attendanceId } = req.body;

  // validate input
  if (!attendanceId) {
    throwError("An error occured whilst fetching student subject attendance data", 400);
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
  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Subject Attendances (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    tabAccess,
    "View Student Subject Attendances (For Level | Course Managers | Subject Teachers)"
  );

  if (absoluteAdmin || hasAdminAccess || hasManagerAccess) {
    const result = await StudentSubjectAttendanceStore.find({
      organisationId: userTokenOrgId,
      attendanceId
    });

    if (!result) {
      throwError("Error fetching relevant student subject attendance records", 500);
    }

    res.status(201).json(result);
    return;
  }

  throwError(
    "Unauthorised Action: You do not have access to view student subject attendances - Please contact your admin",
    403
  );
});

export const getEnrolledSubjectAttendanceStudents = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const {
    academicYearId,
    courseId,
    levelId,
    subjectId,
    subjectTeacherCustomStaffId,
    courseManagerCustomStaffId,
    levelManagerCustomStaffId
  } = req.body;

  // validate input
  if (!academicYearId || !courseId || !levelId || !subjectId) {
    throwError("Please fill in all required fields - Academic Year, Course, Level and Subject", 400);
  }

  if (!subjectTeacherCustomStaffId && !courseManagerCustomStaffId && !levelManagerCustomStaffId) {
    throwError("Please fill in all required fields - Subject Teacher, Course Manager or Level Manager", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  // confirm role
  await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Subject Attendances (Admin Access)");

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

  const staffIsActiveSubjectTeacher = await SubjectTeacher.findOne({
    organisationId: userTokenOrgId,
    subjectId,
    subjectManagerCustomStaffId: isStaff?.staffCustomId,
    status: "Active"
  });

  if (
    !absoluteAdmin &&
    !hasAdminAccess &&
    !staffIsActiveCourseManager &&
    !staffIsActiveLevelManager &&
    !staffIsActiveSubjectTeacher
  ) {
    throwError(
      "Unauthorised Action: You do not have access to create student subject attendance for this course / level / subject or any other course / level / subject - Please contact your admin",
      403
    );
  }

  if (
    absoluteAdmin ||
    hasAdminAccess ||
    staffIsActiveCourseManager ||
    staffIsActiveLevelManager ||
    staffIsActiveSubjectTeacher
  ) {
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

    res.status(201).json(result);
    return;
  }

  throwError(
    "Unauthorised Action: You do not have access to view student subject attendances - Please contact your admin",
    403
  );
});

export const getStudentSubjectAttendances = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, staffId, studentId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Subject Attendances (Admin Access)");

  if (!absoluteAdmin && !hasAdminAccess) {
    const courseManagementDocs = await CourseManager.find({
      organisationId: userTokenOrgId,
      courseManagerStaffId: staffId,
      status: "Active"
    });
    const levelManagementDocs = await LevelManager.find({
      organisationId: userTokenOrgId,
      levelManagerStaffId: staffId,
      status: "Active"
    });

    const subjectManagementDocs = await SubjectTeacher.find({
      organisationId: userTokenOrgId,
      subjectTeacherStaffId: staffId,
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

    let subjectsManaged: any = [];
    if (subjectManagementDocs && subjectManagementDocs.length > 0) {
      subjectsManaged = subjectManagementDocs.map((doc) => doc.subjectId);
    }

    query["$or"] = [
      { courseId: { $in: coursesManaged } },
      { levelId: { $in: levelsManaged } },
      { subjectId: { $in: subjectsManaged } }
    ];
  }

  const result = await fetchStudentSubjectAttendances(
    query,
    cursorType as string,
    parsedLimit,
    organisation!._id.toString()
  );

  if (!result || !result.studentSubjectAttendances) {
    throwError("Error fetching student subject attendances", 500);
  }
  res.status(201).json(result);
  return;
});

// // controller to handle role creation
export const createStudentSubjectAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
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
    level,
    subjectId,
    subjectCustomId,
    subjectFullTitle,
    subjectTeacherCustomStaffId,
    subjectTeacherFullName
  } = req.body;

  const { studentSubjectAttendances, ...rest } = req.body;

  if (!validateStudentSubjectAttendance({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId, accountStatus, staffId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Subject Attendance (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    creatorTabAccess,
    "Create Student Subject Attendance (For Level | Course Managers | Subject Teachers)"
  );
  if (!absoluteAdmin && !hasAdminAccess && !hasManagerAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create student subject attendance for this course / level / subject or any other course / level / subject - Please contact your admin",
      403
    );
  }

  const attendanceExists = await StudentSubjectAttendanceTemplate.findOne({
    organisationId: orgParsedId,
    attendanceCustomId
  });
  if (attendanceExists) {
    throwError(
      "An attendance with this custom id already exists - Either refer to that record or change the custom id",
      409
    );
  }

  const academicYearExist = await AcademicYear.findOne({ organisationId: orgParsedId, academicYear });
  if (!academicYearExist) {
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const courseExist = await Course.findOne({ organisationId: orgParsedId, courseCustomId });
  if (!courseExist) {
    throwError(
      "This course does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const levelExist = await Level.findOne({ organisationId: orgParsedId, levelCustomId });
  if (!levelExist) {
    throwError(
      "This level does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const subjectExist = await Subject.findOne({ organisationId: orgParsedId, subjectCustomId });
  if (!subjectExist) {
    throwError(
      "This subject does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const courseManagerExist = await CourseManager.findOne({
    organisationId: orgParsedId,
    courseId,
    courseManagerCustomStaffId
  });
  if (!courseManagerExist) {
    throwError(
      "This course manager does not have a management record related to this course- Ensure you have created one for them",
      409
    );
  }

  const levelManagerExist = await LevelManager.findOne({
    organisationId: orgParsedId,
    levelId,
    levelManagerCustomStaffId
  });
  if (!levelManagerExist) {
    throwError(
      "This level manager does not have a management record related to this level- Ensure you have created one for them",
      409
    );
  }

  const subjectTeacherExist = await SubjectTeacher.findOne({
    organisationId: orgParsedId,
    subjectId,
    subjectTeacherCustomStaffId
  });
  if (!subjectTeacherExist) {
    throwError(
      "This subject teacher does not have a teaching record related to this subject- Ensure you have created one for them",
      409
    );
  }

  const attendance = await StudentSubjectAttendanceTemplate.create({
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
      levelManagerFullName,
      subjectId,
      subjectCustomId,
      subjectFullTitle,
      subjectTeacherCustomStaffId,
      subjectTeacherFullName
    ])
  });

  if (!attendance) {
    throwError("Error creating student subject attendance template", 500);
  }

  await logActivity(
    account?.organisationId,
    accountId,
    "Student Attendance Creation",
    "StudentSubjectAttendanceTemplate",
    attendance?._id,
    `${attendanceDate} - ${attendanceCustomId} - ${courseFullTitle} - ${level} - ${subjectFullTitle}`,
    [
      {
        kind: "N",
        rhs: attendance
      }
    ],
    new Date()
  );

  if (studentSubjectAttendances.length > 0) {
    const mappedAttendances = studentSubjectAttendances.map((studentSubjectAttendance: any) => ({
      ...studentSubjectAttendance,
      organisationId: orgParsedId,
      attendanceCustomId,
      attendanceId: attendance?._id,
      academicYearId,
      academicYear,
      courseId,
      courseFullTitle,
      levelId,
      level,
      subjectId,
      subjectFullTitle,
      attendanceDate,
      studentId: studentSubjectAttendance.studentId,
      studentCustomId: studentSubjectAttendance.studentCustomId,
      studentFullName: studentSubjectAttendance.studentFullName
    }));
    const studentAttendancess = await StudentSubjectAttendanceStore.insertMany(mappedAttendances, { ordered: true });
    if (!studentAttendancess) {
      throwError(
        "Error creating student subject attendance - However the student subject attendance template was created - close this dialog and try again by editing the created template",
        500
      );
    }
  }

  res.status(201).json("successful");
});

// controller to handle role update
export const updateStudentSubjectAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
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
    level,
    subjectId,
    subjectCustomId,
    subjectFullTitle,
    subjectTeacherCustomStaffId,
    subjectTeacherFullName
  } = req.body;

  const { studentSubjectAttendances, ...rest } = req.body;

  if (!validateStudentSubjectAttendance({ ...req.body })) {
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

  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Subject Attendance (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    creatorTabAccess,
    "Create Student Subject Attendance (For Level | Course Managers | Subject Teachers)"
  );
  if (!absoluteAdmin && !hasAdminAccess && !hasManagerAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create student subject attendance for this course / level or any other course / level - Please contact your admin",
      403
    );
  }

  const attendanceExists = await StudentSubjectAttendanceTemplate.findOne({
    organisationId: orgParsedId,
    attendanceCustomId
  });

  if (!attendanceExists) {
    throwError(
      "An error occured whilst getting this student subject attendance template - Please ensure this attendance exists with the correct Id",
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

  const subjectExist = await Subject.findOne({ organisationId: orgParsedId, subjectCustomId });
  if (!subjectExist) {
    throwError(
      "This subject does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const courseManagerExist = await CourseManager.findOne({
    organisationId: orgParsedId,
    courseId,
    courseManagerCustomStaffId
  });
  if (!courseManagerExist) {
    throwError(
      "This course manager does not have a management record related to this course- Ensure you have created one for them",
      409
    );
  }

  const levelManagerExist = await LevelManager.findOne({
    organisationId: orgParsedId,
    levelId,
    levelManagerCustomStaffId
  });
  if (!levelManagerExist) {
    throwError(
      "This level manager does not have a management record related to this level- Ensure you have created one for them",
      409
    );
  }

  const subjectTeacherExist = await SubjectTeacher.findOne({
    organisationId: orgParsedId,
    subjectId,
    subjectTeacherCustomStaffId
  });
  if (!subjectTeacherExist) {
    throwError(
      "This subject teacher does not have a teaching record related to this subject- Ensure you have created one for them",
      409
    );
  }

  const updatedStudentSubjectAttendance = await StudentSubjectAttendanceTemplate.findByIdAndUpdate(
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
        levelManagerFullName,
        subjectId,
        subjectCustomId,
        subjectFullTitle,
        subjectTeacherCustomStaffId,
        subjectTeacherFullName
      ])
    },
    { new: true }
  );

  if (!updatedStudentSubjectAttendance) {
    throwError("Error updating student subject attendance template", 500);
  }

  const difference = diff(attendanceExists, updatedStudentSubjectAttendance);

  await logActivity(
    account?.organisationId,
    accountId,
    "Student Attendance Update",
    "StudentSubjectAttendanceTemplate",
    updatedStudentSubjectAttendance?._id,
    `${attendanceDate} - ${attendanceCustomId} - ${courseFullTitle} - ${level}`,
    difference,
    new Date()
  );

  if (studentSubjectAttendances.length > 0) {
    const mappedAttendances = studentSubjectAttendances.map((studentSubjectAttendance: any) =>
      studentSubjectAttendance._id && studentSubjectAttendance.organisationId
        ? studentSubjectAttendance
        : {
            ...studentSubjectAttendance,
            organisationId: orgParsedId,
            attendanceCustomId,
            attendanceId: attendanceExists?._id.toString(),
            academicYearId,
            academicYear,
            courseId,
            courseFullTitle,
            levelId,
            level,
            subjectId,
            subjectFullTitle,
            attendanceDate,
            studentId: studentSubjectAttendance.studentId,
            studentCustomId: studentSubjectAttendance.studentCustomId,
            studentFullName: studentSubjectAttendance.studentFullName
          }
    );

    const bulkUpdates = mappedAttendances.map((studentSubjectAttendance: any) => {
      const filter = studentSubjectAttendance._id
        ? { _id: studentSubjectAttendance._id, studentId: studentSubjectAttendance.studentId }
        : { studentId: studentSubjectAttendance.studentId };
      return {
        updateOne: {
          filter,
          update: {
            $set: {
              ...studentSubjectAttendance,
              attendance: studentSubjectAttendance.attendance
            }
          },
          upsert: true
        }
      };
    });
    const studentAttendancess = await StudentSubjectAttendanceStore.bulkWrite(bulkUpdates, { ordered: true });
    if (!studentAttendancess) {
      throwError(
        "Error updating student subject attendances - However the student subject attendance template was updated - close this dialog and try again by editing the created template",
        500
      );
    }
  }

  res.status(201).json("successful");
});

// controller to handle deleting roles
export const deleteStudentSubjectAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { studentSubjectAttendanceIDToDelete } = req.body;
  if (!studentSubjectAttendanceIDToDelete) {
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
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Subject Attendance (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    creatorTabAccess,
    "Create Student Subject Attendance (For Level | Course Managers | Subject Teachers)"
  );
  if (!absoluteAdmin && !hasAdminAccess && !hasManagerAccess) {
    throwError(
      "Unauthorised Action: You do not have access to delete student subject attendance - Please contact your admin",
      403
    );
  }

  const StudentSubjectAttendanceToDelete = await StudentSubjectAttendanceTemplate.findById(
    studentSubjectAttendanceIDToDelete
  );

  if (!StudentSubjectAttendanceToDelete) {
    throwError("Error finding student subject attendance template - Please try again", 404);
  }

  const deletedStudentSubjectAttendanceStore = await StudentSubjectAttendanceStore.deleteMany({
    attendanceId: studentSubjectAttendanceIDToDelete
  });

  if (!deletedStudentSubjectAttendanceStore) {
    throwError("Error deleting student subject attendance - Please try again", 500);
  }

  const deletedStudentSubjectAttendance = await StudentSubjectAttendanceTemplate.findByIdAndDelete(
    studentSubjectAttendanceIDToDelete
  );
  if (!deletedStudentSubjectAttendance) {
    throwError("Error deleting student subject attendance template - Please try again", 500);
  }

  const emitRoom = deletedStudentSubjectAttendance?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "studentsubjectattendancetemplates", deletedStudentSubjectAttendance, "delete");

  await logActivity(
    account?.organisationId,
    accountId,
    "Student Attendance Delete",
    "StudentSubjectAttendanceTemplate",
    deletedStudentSubjectAttendance?._id,
    deletedStudentSubjectAttendance?._id.toString(),
    [
      {
        kind: "D" as any,
        lhs: deletedStudentSubjectAttendance
      }
    ],
    new Date()
  );

  res.status(201).json("successful");
});
