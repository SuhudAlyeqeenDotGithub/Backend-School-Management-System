import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  emitToOrganisation,
  logActivity,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  fetchStudentSubjectAttendances
} from "../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../utils/pureFuctions.ts";
import {
  StudentSubjectAttendanceStore,
  StudentSubjectAttendanceTemplate
} from "../../models/student/subjectAttendance.ts";
import { AcademicYear } from "../../models/timeline/academicYear.ts";
import { Pathway, PathwayManager } from "../../models/curriculum/pathway.ts";
import { Class, ClassTutor } from "../../models/curriculum/class.ts";
import { StudentEnrollment } from "../../models/student/enrollment.ts";
import { Staff } from "../../models/staff/profile.ts";
import { ClassSubject, ClassSubjectTeacher } from "../../models/curriculum/classSubject.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";

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
  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Subject Attendances (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    tabAccess,
    "View Student Subject Attendances (For Class | Pathway Managers | Subject Teachers)"
  );

  if (absoluteAdmin || hasAdminAccess || hasManagerAccess) {
    const result = await StudentSubjectAttendanceStore.find({
      organisationId: userTokenOrgId,
      attendanceId
    });

    if (!result) {
      throwError("Error fetching relevant student subject attendance records", 500);
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
    "Unauthorised Action: You do not have access to view student subject attendances - Please contact your admin",
    403
  );
});

export const getEnrolledSubjectAttendanceStudents = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const {
    academicYearId,
    pathwayId,
    classId,
    classSubjectId,
    subjectTeacherCustomStaffId,
    pathwayManagerCustomStaffId,
    classManagerCustomStaffId
  } = req.body;

  // validate input
  if (!academicYearId || !pathwayId || !classId || !classSubjectId) {
    throwError("Please fill in all required fields - Academic Year, Pathway, Class and Subject", 400);
  }

  if (!subjectTeacherCustomStaffId && !pathwayManagerCustomStaffId && !classManagerCustomStaffId) {
    throwError("Please fill in all required fields - Subject Teacher, Pathway Manager or Class Tutor", 400);
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
  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Subject Attendances (Admin Access)");

  const isStaff = await Staff.findOne({ _id: staffId });
  if (!isStaff && !absoluteAdmin) {
    throwError("Unauthorised Action: We could not find your staff details", 403);
  }

  const staffIsActivePathwayManager = await PathwayManager.findOne({
    organisationId: userTokenOrgId,
    pathwayId,
    pathwayManagerCustomStaffId: isStaff?.customId,
    status: "Active"
  });
  const staffIsActiveClassTutor = await ClassTutor.findOne({
    organisationId: userTokenOrgId,
    classId,
    classTutorCustomStaffId: isStaff?.customId,
    status: "Active"
  });

  const staffIsActiveSubjectTeacher = await ClassSubjectTeacher.findOne({
    organisationId: userTokenOrgId,
    classSubjectId,
    subjectManagerCustomStaffId: isStaff?.customId,
    status: "Active"
  });

  if (
    !absoluteAdmin &&
    !hasAdminAccess &&
    !staffIsActivePathwayManager &&
    !staffIsActiveClassTutor &&
    !staffIsActiveSubjectTeacher
  ) {
    throwError(
      "Unauthorised Action: You do not have access to create student subject attendance for this pathway / class / subject or any other pathway / class / subject - Please contact your admin",
      403
    );
  }

  if (
    absoluteAdmin ||
    hasAdminAccess ||
    staffIsActivePathwayManager ||
    staffIsActiveClassTutor ||
    staffIsActiveSubjectTeacher
  ) {
    const result = await StudentEnrollment.find(
      {
        organisationId: userTokenOrgId,
        pathwayId,
        classId,
        academicYearId
      },
      "_id studentId studentCustomId studentFullName"
    );

    if (!result) {
      throwError("Error fetching relevant enrolled student records", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 6 + result.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          result,
          pathwayManagerCustomStaffId,
          classManagerCustomStaffId,
          subjectTeacherCustomStaffId,
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
  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Subject Attendances (Admin Access)");

  if (!absoluteAdmin && !hasAdminAccess) {
    const pathwayManagementDocs = await PathwayManager.find({
      organisationId: userTokenOrgId,
      pathwayManagerStaffId: staffId,
      status: "Active"
    });
    const classManagementDocs = await ClassTutor.find({
      organisationId: userTokenOrgId,
      classManagerStaffId: staffId,
      status: "Active"
    });

    const subjectManagementDocs = await ClassSubjectTeacher.find({
      organisationId: userTokenOrgId,
      subjectTeacherStaffId: staffId,
      status: "Active"
    });

    let pathwaysManaged: any = [];
    if (pathwayManagementDocs && pathwayManagementDocs.length > 0) {
      pathwaysManaged = pathwayManagementDocs.map((doc) => doc.pathwayId);
    }

    let classsManaged: any = [];
    if (classManagementDocs && classManagementDocs.length > 0) {
      classsManaged = classManagementDocs.map((doc: any) => doc.classId);
    }

    let subjectsManaged: any = [];
    if (subjectManagementDocs && subjectManagementDocs.length > 0) {
      subjectsManaged = subjectManagementDocs.map((doc) => doc.classSubjectId);
    }

    query["$or"] = [
      { pathwayId: { $in: pathwaysManaged } },
      { classId: { $in: classsManaged } },
      { classSubjectId: { $in: subjectsManaged } }
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
  const { accountId } = req.userToken;
  const {
    attendanceCustomId,
    academicYearId,
    academicYear,
    pathwayId,
    attendanceStatus,
    attendanceDate,
    pathwayCustomId,
    pathwayFullTitle,
    pathwayManagerStaffId,
    pathwayManagerCustomStaffId,
    pathwayManagerFullName,
    classManagerStaffId,
    classManagerCustomStaffId,
    classManagerFullName,
    classId,
    classCustomId,
    className,
    classSubjectId,
    subjectCustomId,
    subjectFullTitle,
    subjectTeacherCustomStaffId,
    subjectTeacherFullName
  } = req.body;

  const { studentSubjectAttendances, ...rest } = req.body;

  if (studentSubjectAttendances.length === 0) {
    throwError(
      "You cannot create an empty student subject attendance - Please load students or come back to create this when you are ready",
      400
    );
  }

  if (!validateStudentSubjectAttendance({ ...req.body })) {
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
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Subject Attendance (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    creatorTabAccess,
    "Create Student Subject Attendance (For Class | Pathway Managers | Subject Teachers)"
  );
  if (!absoluteAdmin && !hasAdminAccess && !hasManagerAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create student subject attendance for this pathway / class / subject or any other pathway / class / subject - Please contact your admin",
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

  const academicYearExists = await AcademicYear.findOne({ organisationId: orgParsedId, academicYear });
  if (!academicYearExists) {
    throwError(
      "This academic year does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const pathwayExists = await Pathway.findOne({ organisationId: orgParsedId, pathwayCustomId });
  if (!pathwayExists) {
    throwError(
      "This pathway does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const classExists = await Class.findOne({ organisationId: orgParsedId, classCustomId });
  if (!classExists) {
    throwError(
      "This class does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const subjectExists = await ClassSubject.findOne({ organisationId: orgParsedId, subjectCustomId });
  if (!subjectExists) {
    throwError(
      "This subject does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const pathwayManagerExists = await PathwayManager.findOne({
    organisationId: orgParsedId,
    pathwayId,
    pathwayManagerCustomStaffId
  });
  if (!pathwayManagerExists) {
    throwError(
      "This pathway manager does not have a management record related to this pathway- Ensure you have created one for them",
      409
    );
  }

  const classManagerExists = await ClassTutor.findOne({
    organisationId: orgParsedId,
    classId,
    classManagerCustomStaffId
  });
  if (!classManagerExists) {
    throwError(
      "This class manager does not have a management record related to this class- Ensure you have created one for them",
      409
    );
  }

  const subjectTeacherExists = await ClassSubjectTeacher.findOne({
    organisationId: orgParsedId,
    classSubjectId,
    subjectTeacherCustomStaffId
  });
  if (!subjectTeacherExists) {
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
      pathwayFullTitle,
      className,
      pathwayId,
      classId,
      pathwayCustomId,
      classCustomId,
      attendanceStatus,
      academicYear,
      academicYearId,
      attendanceDate,
      pathwayManagerStaffId,
      pathwayManagerCustomStaffId,
      pathwayManagerFullName,
      classManagerStaffId,
      classManagerCustomStaffId,
      classManagerFullName,
      classSubjectId,
      subjectCustomId,
      subjectFullTitle,
      subjectTeacherCustomStaffId,
      subjectTeacherFullName
    ])
  });

  if (!attendance) {
    throwError("Error creating student subject attendance template", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Attendance Creation",
      "StudentSubjectAttendanceTemplate",
      attendance?._id,
      `${attendanceDate} - ${attendanceCustomId} - ${pathwayFullTitle} - ${className} - ${subjectFullTitle}`,
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

  if (studentSubjectAttendances.length > 0) {
    mappedAttendances = studentSubjectAttendances.map((studentSubjectAttendance: any) => ({
      ...studentSubjectAttendance,
      organisationId: orgParsedId,
      attendanceCustomId,
      attendanceId: attendance?._id,
      academicYearId,
      academicYear,
      pathwayId,
      pathwayFullTitle,
      classId,
      className,
      classSubjectId,
      subjectFullTitle,
      attendanceDate,
      studentId: studentSubjectAttendance.studentId,
      studentCustomId: studentSubjectAttendance.studentCustomId,
      studentFullName: studentSubjectAttendance.studentFullName
    }));
    studentAttendances = await StudentSubjectAttendanceStore.insertMany(mappedAttendances, { ordered: true });
    if (!studentAttendances) {
      throwError(
        "Error creating student subject attendance - However the student subject attendance template was created - close this dialog and try again by editing the created template",
        500
      );
    }
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 13 + (logActivityAllowed ? 2 : 0) + mappedAttendances.length * 2 },
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
          classManagerExists,
          pathwayManagerExists,
          classExists,
          pathwayExists,
          academicYearExists,
          subjectExists,
          subjectTeacherExists,
          organisation,
          role,
          account
        ]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});

// controller to handle role update
export const updateStudentSubjectAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const {
    attendanceCustomId,
    academicYearId,
    academicYear,
    pathwayId,
    attendanceStatus,
    attendanceDate,
    pathwayCustomId,
    pathwayFullTitle,
    pathwayManagerStaffId,
    pathwayManagerCustomStaffId,
    pathwayManagerFullName,
    classManagerStaffId,
    classManagerCustomStaffId,
    classManagerFullName,
    classId,
    classCustomId,
    className,
    classSubjectId,
    subjectCustomId,
    subjectFullTitle,
    subjectTeacherCustomStaffId,
    subjectTeacherFullName
  } = req.body;

  const { studentSubjectAttendances, ...rest } = req.body;

  if (!validateStudentSubjectAttendance({ ...req.body })) {
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
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Subject Attendance (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    creatorTabAccess,
    "Create Student Subject Attendance (For Class | Pathway Managers | Subject Teachers)"
  );
  if (!absoluteAdmin && !hasAdminAccess && !hasManagerAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create student subject attendance for this pathway / class or any other pathway / class - Please contact your admin",
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

  const pathwayExists = await Pathway.findOne({ organisationId: orgParsedId, pathwayCustomId });
  if (!pathwayExists) {
    throwError(
      "No pathway with the provided Custom Id exist - Please create the pathway or change the pathway custom Id",
      409
    );
  }

  const classExists = await Class.findOne({ organisationId: orgParsedId, classCustomId });
  if (!classExists) {
    throwError(
      "No class with the provided Custom Id exist - Please create the class or change the class custom Id",
      409
    );
  }

  const subjectExists = await ClassSubject.findOne({ organisationId: orgParsedId, subjectCustomId });
  if (!subjectExists) {
    throwError(
      "This subject does not exist in this organisation - Ensure it has been created or has not been deleted",
      409
    );
  }

  const pathwayManagerExists = await PathwayManager.findOne({
    organisationId: orgParsedId,
    pathwayId,
    pathwayManagerCustomStaffId
  });
  if (!pathwayManagerExists) {
    throwError(
      "This pathway manager does not have a management record related to this pathway- Ensure you have created one for them",
      409
    );
  }

  const classManagerExists = await ClassTutor.findOne({
    organisationId: orgParsedId,
    classId,
    classManagerCustomStaffId
  });
  if (!classManagerExists) {
    throwError(
      "This class manager does not have a management record related to this class- Ensure you have created one for them",
      409
    );
  }

  const subjectTeacherExists = await ClassSubjectTeacher.findOne({
    organisationId: orgParsedId,
    classSubjectId,
    subjectTeacherCustomStaffId
  });
  if (!subjectTeacherExists) {
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
        pathwayFullTitle,
        className,
        pathwayId,
        classId,
        pathwayCustomId,
        classCustomId,
        attendanceStatus,
        academicYear,
        academicYearId,
        attendanceDate,
        pathwayManagerStaffId,
        pathwayManagerCustomStaffId,
        pathwayManagerFullName,
        classManagerStaffId,
        classManagerCustomStaffId,
        classManagerFullName,
        classSubjectId,
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

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(attendanceExists, updatedStudentSubjectAttendance);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Attendance Update",
      "StudentSubjectAttendanceTemplate",
      updatedStudentSubjectAttendance?._id,
      `${attendanceDate} - ${attendanceCustomId} - ${pathwayFullTitle} - ${className}`,
      difference,
      new Date()
    );
  }

  let mappedAttendances: any = [];
  let studentAttendances;

  if (studentSubjectAttendances.length > 0) {
    mappedAttendances = studentSubjectAttendances.map((studentSubjectAttendance: any) =>
      studentSubjectAttendance._id && studentSubjectAttendance.organisationId
        ? studentSubjectAttendance
        : {
            ...studentSubjectAttendance,
            organisationId: orgParsedId,
            attendanceCustomId,
            attendanceId: attendanceExists?._id.toString(),
            academicYearId,
            academicYear,
            pathwayId,
            pathwayFullTitle,
            classId,
            className,
            classSubjectId,
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
    studentAttendances = await StudentSubjectAttendanceStore.bulkWrite(bulkUpdates, { ordered: true });
    if (!studentAttendances) {
      throwError(
        "Error updating student subject attendances - However the student subject attendance template was updated - close this dialog and try again by editing the created template",
        500
      );
    }
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 13 + (logActivityAllowed ? 2 : 0) + mappedAttendances.length * 2 },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([
          mappedAttendances,
          updatedStudentSubjectAttendance,
          attendanceExists,
          classManagerExists,
          pathwayManagerExists,
          classExists,
          pathwayExists,
          academicYearExists,
          subjectExists,
          subjectTeacherExists,
          organisation,
          role,
          account
        ]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});

// controller to handle deleting roles
export const deleteStudentSubjectAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { studentSubjectAttendanceIDToDelete } = req.body;
  if (!studentSubjectAttendanceIDToDelete) {
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

  const { roleId: creatorRoleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Subject Attendance (Admin Access)");
  const hasManagerAccess = checkAccess(
    account,
    creatorTabAccess,
    "Create Student Subject Attendance (For Class | Pathway Managers | Subject Teachers)"
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

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
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
  }

  let oneRecordSize = 0.0000006;

  const foundRecord = await StudentSubjectAttendanceStore.findOne({ attendanceId: studentSubjectAttendanceIDToDelete });

  if (foundRecord) {
    oneRecordSize = getObjectSize(foundRecord);
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 7 + (logActivityAllowed ? 2 : 0) + deletedStudentSubjectAttendanceStore.deletedCount * 2
    },
    {
      field: "databaseStorageAndBackup",
      value:
        toNegative(getObjectSize(deletedStudentSubjectAttendance) * 2) +
        toNegative(getObjectSize(oneRecordSize) * deletedStudentSubjectAttendanceStore.deletedCount * 2) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([
          deletedStudentSubjectAttendance,
          organisation,
          role,
          foundRecord,
          account,
          StudentSubjectAttendanceToDelete
        ]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});
