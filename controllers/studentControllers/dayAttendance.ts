import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  emitToOrganisation,
  logActivity,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  fetchStudentDayAttendanceTemplates
} from "../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../utils/pureFuctions.ts";
import { StudentDayAttendance, StudentDayAttendanceTemplate } from "../../models/student/dayattendance.ts";
import { PathwayManager } from "../../models/curriculum/pathway.ts";
import { Class, ClassTutor } from "../../models/curriculum/class.ts";
import { StudentEnrollment } from "../../models/student/enrollment.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { ProgrammeManager } from "../../models/curriculum/programme.ts";

const validateStudentDayAttendance = (studentDataParam: any) => {
  const { notes, academicYear, pathway, pathwayId, programme, takenByFullName, className, ...copyLocalData } =
    studentDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

// export const fetchStudentDayAttendances = asyncHandler(async (req: Request, res: Response) => {
//   const { accountId, organisationId: userTokenOrgId } = req.userToken;
//   const { attendanceTemplateId } = req.body;

//   // validate input
//   if (!attendanceTemplateId) {
//     throwError("An error occured whilst fetching student day attendance data", 400);
//   }

//   // confirm user
//   const { account, role, organisation } = await confirmUserOrgRole(accountId);
//   const orgHasRequiredFeature = organisation?.features?.map((feature) => feature.name).includes("Student Attendance");
//   if (!orgHasRequiredFeature) {
//     throwError(
//       "This feature is not enabled for this organisation - You need to purchase Student Attendance to use it",
//       403
//     );
//   }

//   const { roleId } = account as any;
//   const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

//   const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

//   if (!checkPassed) {
//     registerBillings(req, [
//       { field: "databaseOperation", value: 3 },
//       { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
//     ]);
//     throwError(message, 409);
//   }
//   const hasAdminAccess = checkAccess(account, tabAccess, "View Student Day Attendances (Admin Access)");

//   if (!absoluteAdmin && !hasAdminAccess) {
//     throwError(
//       "Unauthorised Action: You do not have access to view student day attendances - Please contact your admin",
//       403
//     );
//   }
//   const result = await StudentDayAttendance.find({
//     organisationId: userTokenOrgId,
//     attendanceTemplateId
//   });

//   if (!result) {
//     throwError("Error fetching relevant student day attendance records", 500);
//   }

//   registerBillings(req, [
//     { field: "databaseOperation", value: 3 + result.length },
//     {
//       field: "databaseDataTransfer",
//       value: getObjectSize([result, organisation, role, account])
//     }
//   ]);
//   res.status(201).json(result);
// });

export const getEnrolledDayAttendanceStudents = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { academicYearId, pathwayId, classId, programmeId, isActiveManagerOrTutor } = req.body;

  // validate input
  if (!academicYearId || !classId) {
    throwError("Please fill in all required fields - Academic Year, Class", 400);
  }

  if (!programmeId) {
    throwError("We could not get programme id - please close the dialog and try again", 400);
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
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Day Attendances (Admin Access)");
  if (!absoluteAdmin && !hasAdminAccess && !isActiveManagerOrTutor) {
    throwError(
      "Unauthorised Action: You do not have access to view or create student day attendance for this class - Please contact your admin",
      403
    );
  }

  const result = (await StudentEnrollment.find(
    {
      organisationId: userTokenOrgId,
      programmeId,
      pathwayId: pathwayId ? pathwayId : null,
      classId,
      academicYearId
    },
    "_id studentId"
  )
    .populate({
      path: "studentId",
      select: "fullName customId"
    })
    .lean()) as any[];

  if (!result) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    throwError("Error fetching relevant enrolled student records", 500);
  }

  const mergedResults = result.map((result) => {
    return {
      _id: result._id,
      studentId: result.studentId._id,
      fullName: result.studentId.fullName,
      studentCustomId: result.studentId.customId
    };
  });

  registerBillings(req, [
    { field: "databaseOperation", value: 4 + result.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);

  res.status(201).json(mergedResults);
});

export const getStudentDayAttendanceTemplates = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  const { search = "", limit, cursorType, nextCursor, prevCursor, from, to, ...filters } = req.query;
  const parsedLimit = parseInt(limit as string);

  const query: any = { organisationId: userTokenOrgId };
  if (search) {
    query.searchText = { $regex: search, $options: "i" };
  }

  if (from && to) {
    const fromDate = new Date(from as string);
    const toDate = new Date(to as string);

    toDate.setDate(toDate.getDate() + 1);

    query.takenOn = {
      $gte: fromDate,
      $lt: toDate
    };
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
  const orgHasRequiredFeature = organisation?.features?.map((feature) => feature.name).includes("Student Attendance");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Attendance to use it",
      403
    );
  }

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, tabAccess, "View Student Day Attendances (Admin Access)");

  let pathwayManagementDocs;
  let classManagementDocs;
  let programmeManagementDocs;

  let isActiveManagerOrTutor = false;
  let allowedProgrammesPathwaysClassesIds: any = [];

  if (!absoluteAdmin && !hasAdminAccess) {
    programmeManagementDocs = await ProgrammeManager.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();
    pathwayManagementDocs = await PathwayManager.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();
    classManagementDocs = await ClassTutor.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();

    isActiveManagerOrTutor =
      programmeManagementDocs.length > 0 || pathwayManagementDocs.length > 0 || classManagementDocs.length > 0;
    let programmesManaged: any = [];
    if (programmeManagementDocs && programmeManagementDocs.length > 0) {
      programmesManaged = programmeManagementDocs.map((doc) => doc.programmeId);
    }

    let pathwaysManaged: any = [];
    if (pathwayManagementDocs && pathwayManagementDocs.length > 0) {
      pathwaysManaged = pathwayManagementDocs.map((doc) => doc.pathwayId);
    }

    let classsManaged: any = [];
    if (classManagementDocs && classManagementDocs.length > 0) {
      classsManaged = classManagementDocs.map((doc) => doc.classId);
    }

    allowedProgrammesPathwaysClassesIds = [
      ...programmesManaged.map((doc: any) => doc.toString()),
      ...pathwaysManaged.map((doc: any) => doc.toString()),
      ...classsManaged.map((doc: any) => doc.toString())
    ];

    query["$or"] = [
      { programmeId: { $in: programmesManaged } },
      { pathwayId: { $in: pathwaysManaged } },
      { classId: { $in: classsManaged } }
    ];
  }

  const result = await fetchStudentDayAttendanceTemplates(
    query,
    cursorType as string,
    parsedLimit,
    organisation!._id.toString()
  );

  if (!result || !result.studentDayAttendanceTemplates) {
    registerBillings(req, [
      {
        field: "databaseOperation",
        value:
          3 +
          result.studentDayAttendanceTemplates.length +
          (pathwayManagementDocs ? pathwayManagementDocs.length : 0) +
          (classManagementDocs ? classManagementDocs.length : 0) +
          (programmeManagementDocs ? programmeManagementDocs.length : 0)
      },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          result,
          pathwayManagementDocs,
          classManagementDocs,
          programmeManagementDocs,
          organisation,
          role,
          account
        ])
      }
    ]);
    throwError("Error fetching student day attendances", 500);
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value:
        3 +
        result.studentDayAttendanceTemplates.length +
        (pathwayManagementDocs ? pathwayManagementDocs.length : 0) +
        (classManagementDocs ? classManagementDocs.length : 0) +
        (programmeManagementDocs ? programmeManagementDocs.length : 0)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([
        result,
        pathwayManagementDocs,
        classManagementDocs,
        programmeManagementDocs,
        organisation,
        role,
        account
      ])
    }
  ]);

  const reformedData = {
    ...result,
    isActiveManagerOrTutor: isActiveManagerOrTutor,
    allowedProgrammesPathwaysClassesIds: allowedProgrammesPathwaysClassesIds.filter((id: any) => !!id)
  };
  res.status(201).json(reformedData);
  return;
});

// // controller to handle role creation
export const createStudentDayAttendanceTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId } = req.userToken;
  const { customId, academicYearId, attendanceStatus, takenOn, pathwayId, programmeId, takenBy, status, classId } =
    req.body;

  const { studentDayAttendances, isActiveManagerOrTutor, ...rest } = req.body;

  if (!studentDayAttendances || studentDayAttendances.length === 0) {
    throwError(
      "You cannot create an empty student day attendance - Please load students or come back to create this when you are ready",
      400
    );
  }

  if (!validateStudentDayAttendance(rest)) {
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

  const { roleId, name, email, _id } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Day Attendance (Admin Access)");

  if (!absoluteAdmin && !hasAdminAccess && !isActiveManagerOrTutor) {
    throwError(
      "Unauthorised Action: You do not have access to create student day attendance for this class - Please contact your admin",
      403
    );
  }

  const attendanceExists = await StudentDayAttendanceTemplate.findOne({
    organisationId,
    customId
  }).lean();
  if (attendanceExists) {
    throwError(
      "An attendance with this custom id already exists - it could have been created in a last attempt before an error - Either refer to that record or change the custom id",
      409
    );
  }

  const classExists = await Class.findOne({ _id: classId }).lean();
  if (!classExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("The selected class does not exist - Please change the class", 409);
  }

  const attendance = await StudentDayAttendanceTemplate.create({
    ...rest,
    organisationId,
    pathwayId: pathwayId ? pathwayId : null,
    searchText: generateSearchText([
      customId,
      pathwayId,
      programmeId,
      classId,
      status,
      academicYearId,
      attendanceStatus,
      takenOn,
      takenBy
    ])
  });

  if (!attendance) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, attendanceExists, classExists])
      }
    ]);
    throwError("Error creating student day attendance template", 500);
  }

  if (absoluteAdmin || hasAdminAccess || isActiveManagerOrTutor) {
    const emitRoom = attendance?.organisationId?.toString() ?? "";
    emitToOrganisation(
      emitRoom,
      "studentdayattendancetemplates",
      { ...attendance?.toObject(), takenBy: { name, email, _id } },
      "insert"
    );
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
      `${takenOn} - ${customId}`,
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
      organisationId,
      attendanceTemplateId: attendance?._id,
      academicYearId,
      programmeId: attendance?.programmeId,
      pathwayId: attendance?.pathwayId ? attendance?.pathwayId : null,
      classId,
      takenOn,
      studentId: studentDayAttendance.studentId
    }));

    studentAttendances = await StudentDayAttendance.insertMany(mappedAttendances, {
      ordered: true
    });
    if (!studentAttendances) {
      registerBillings(req, [
        { field: "databaseOperation", value: 7 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([mappedAttendances, attendance, attendanceExists, classExists])
        }
      ]);
      throwError(
        "Error creating student day attendance - However the student day attendance template was created - close this dialog and try again by editing the created template",
        500
      );
    }
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) + mappedAttendances.length * 2 },
    {
      field: "databaseStorageAndBackup",
      value:
        (getObjectSize([attendance, studentAttendances]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([mappedAttendances, attendance, attendanceExists, organisation, role, account, classExists]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});

// controller to handle role update
export const updateStudentDayAttendanceTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId } = req.userToken;
  const { customId, academicYearId, attendanceStatus, takenOn, pathwayId, programmeId, takenBy, status, classId } =
    req.body;

  const { studentDayAttendances, isActiveManagerOrTutor, ...rest } = req.body;

  if (!validateStudentDayAttendance({ ...req.body })) {
    throwError("Please fill in all required fields", 400);
  }

  if (!studentDayAttendances || studentDayAttendances.length === 0) {
    throwError(
      "You cannot create an empty student day attendance - Please load students or come back to create this when you are ready",
      400
    );
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

  const { roleId, name, email, _id } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Day Attendance (Admin Access)");

  if (!absoluteAdmin && !hasAdminAccess && !isActiveManagerOrTutor) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to create student day attendance for this class or any other class - Please contact your admin",
      403
    );
  }

  const attendanceExists = await StudentDayAttendanceTemplate.findOne({
    organisationId: orgParsedId,
    customId
  }).lean();

  if (!attendanceExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "An error occured whilst getting this student day attendance template - Please ensure this attendance exists with the correct Id",
      500
    );
  }
  const updatedStudentDayAttendance = await StudentDayAttendanceTemplate.findByIdAndUpdate(
    attendanceExists?._id,
    {
      ...rest,
      takenBy: accountId,
      pathwayId: pathwayId ? pathwayId : null,
      searchText: generateSearchText([
        customId,
        pathwayId,
        programmeId,
        classId,
        status,
        academicYearId,
        attendanceStatus,
        takenOn,
        takenBy
      ])
    },
    { new: true }
  ).lean();

  if (!updatedStudentDayAttendance) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, attendanceExists]) }
    ]);
    throwError("Error updating student day attendance template", 500);
  }

  if (absoluteAdmin || hasAdminAccess || isActiveManagerOrTutor) {
    const emitRoom = updatedStudentDayAttendance?.organisationId?.toString() ?? "";
    emitToOrganisation(
      emitRoom,
      "studentdayattendancetemplates",
      { ...updatedStudentDayAttendance, takenBy: { name, email, _id } },
      "update"
    );
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
      `${takenOn} - ${customId}`,
      difference,
      new Date()
    );
  }

  let mappedAttendances: any = [];
  let studentAttendances;
  if (studentDayAttendances.length > 0) {
    mappedAttendances = studentDayAttendances.map((studentDayAttendance: any) =>
      studentDayAttendance._id && studentDayAttendance.organisationId && studentDayAttendance.attendanceTemplateId
        ? { ...studentDayAttendance, takenBy: accountId }
        : {
            ...studentDayAttendance,
            organisationId,
            attendanceTemplateId: updatedStudentDayAttendance?._id,
            academicYearId,
            programmeId: updatedStudentDayAttendance?.programmeId,
            pathwayId: updatedStudentDayAttendance?.pathwayId ? updatedStudentDayAttendance?.pathwayId : null,
            classId,
            takenOn,
            takenBy: accountId,
            studentId: studentDayAttendance.studentId
          }
    );

    const bulkUpdates = mappedAttendances.map((studentDayAttendance: any) => {
      if (studentDayAttendance._id) {
        const { _id, ...updateData } = studentDayAttendance;

        return {
          updateOne: {
            filter: { _id },
            update: {
              $set: updateData
            },
            upsert: true
          }
        };
      }

      return {
        insertOne: {
          document: studentDayAttendance
        }
      };
    });
    studentAttendances = await StudentDayAttendance.bulkWrite(bulkUpdates, { ordered: true });
    if (!studentAttendances) {
      registerBillings(req, [
        { field: "databaseOperation", value: 8 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([organisation, role, account, attendanceExists, updatedStudentDayAttendance])
        }
      ]);
      throwError(
        "Error updating student day attendances - However the student day attendance template was updated - close this dialog and try again by editing the created template",
        500
      );
    }
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) + mappedAttendances.length * 2 },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([mappedAttendances, updatedStudentDayAttendance, attendanceExists, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});

// controller to handle deleting roles
export const deleteStudentDayAttendanceTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { studentDayAttendanceTemplateIDToDelete, isActiveManagerOrTutor } = req.body;
  if (!studentDayAttendanceTemplateIDToDelete) {
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
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAdminAccess = checkAccess(account, creatorTabAccess, "Create Student Day Attendance (Admin Access)");
  if (!absoluteAdmin && !hasAdminAccess && !isActiveManagerOrTutor) {
    throwError(
      "Unauthorised Action: You do not have access to delete student day attendance - Please contact your admin",
      403
    );
  }

  const deletedStudentDayAttendances = await StudentDayAttendance.deleteMany({
    attendanceTemplateId: studentDayAttendanceTemplateIDToDelete
  });

  if (!deletedStudentDayAttendances.acknowledged) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting student day attendance - Please try again", 500);
  }

  const deletedStudentDayAttendanceTemplate = await StudentDayAttendanceTemplate.findByIdAndDelete(
    studentDayAttendanceTemplateIDToDelete
  );
  if (!deletedStudentDayAttendanceTemplate) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting student day attendance template - Please try again", 500);
  }

  const emitRoom = deletedStudentDayAttendanceTemplate?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "studentdayattendancetemplates", deletedStudentDayAttendanceTemplate, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Student Attendance Delete",
      "StudentDayAttendanceTemplate",
      deletedStudentDayAttendanceTemplate?._id,
      deletedStudentDayAttendanceTemplate?._id.toString(),
      [
        {
          kind: "D" as any,
          lhs: deletedStudentDayAttendanceTemplate
        }
      ],
      new Date()
    );
  }

  let oneRecordSize = 0.0000006;

  const foundRecord = await StudentDayAttendance.findOne({
    attendanceTemplateId: studentDayAttendanceTemplateIDToDelete
  }).lean();

  if (foundRecord) {
    oneRecordSize = getObjectSize(foundRecord);
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 6 + (logActivityAllowed ? 2 : 0) + deletedStudentDayAttendances.deletedCount * 2
    },
    {
      field: "databaseStorageAndBackup",
      value:
        toNegative(getObjectSize(deletedStudentDayAttendanceTemplate) * 2) +
        toNegative(getObjectSize(oneRecordSize) * deletedStudentDayAttendances.deletedCount * 2) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedStudentDayAttendanceTemplate, organisation, role, account, foundRecord]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successful");
});
