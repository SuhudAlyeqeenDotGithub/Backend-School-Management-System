import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchStudentProfiles,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllStudentProfiles,
  orgHasRequiredFeature,
  validatePhoneNumber,
  checkAccesses
} from "../../utils/databaseFunctions.ts";
import { logActivity } from "../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { throwError, toNegative, generateSearchText, getObjectSize, validateEmail } from "../../utils/pureFuctions.ts";
import { Student } from "../../models/student/studentProfile";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { getNeededAccesses } from "../../utils/defaultVariables.ts";

const validateStudentProfile = (studentDataParam: any) => {
  const {
    imageUrl,
    imageLocalDestination,
    qualifications,
    workExperience,
    identification,
    skills,
    email,
    phone,
    postCode,
    endDate,
    ...copyLocalData
  } = studentDataParam;

  if (studentDataParam.email && !validateEmail(studentDataParam.email)) {
    throwError("Please enter a valid email address.", 400);
    return false;
  }

  if (!validateEmail(studentDataParam.nextOfKinEmail)) {
    throwError("Please enter a valid next of kin email address.", 400);
    return false;
  }

  if (!validatePhoneNumber(studentDataParam.phone)) {
    throwError("Please enter a valid phone number with the country code. e.g +234, +447", 400);
    return false;
  }

  if (!validatePhoneNumber(studentDataParam.nextOfKinPhone)) {
    throwError("Please enter a valid next of kin phone number with the country code. e.g +234, +447", 400);
    return false;
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
  const hasAccess = checkAccesses(account, tabAccess, getNeededAccesses("All Student Profiles"));

  if (absoluteAdmin || hasAccess) {
    const studentProfiles = await fetchAllStudentProfiles(organisation!._id.toString());

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
  const hasAccess = checkAccess(account, tabAccess, "View Student Profiles");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchStudentProfiles(query, cursorType as string, parsedLimit, organisation!._id.toString());

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
  const { accountId } = req.userToken;
  const body = req.body;
  const { customId, fullName, dateOfBirth, studentGender, email, nationality, nextOfKinName, nextOfKinEmail } = body;

  if (!validateStudentProfile(body)) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Student Profile");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create student - Please contact your admin", 403);
  }

  const orConditions: any[] = [{ customId }];
  if (email) {
    orConditions.push({ email });
  }

  const studentExists = await Student.findOne({
    organisationId: orgParsedId,
    $or: orConditions
  }).lean();

  if (studentExists) {
    if (studentExists.customId === customId) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError(
        "A student with this Custom Id already exists within the organisation - Either refer to that record or change the student custom Id",
        409
      );
    }
    if (studentExists.email === email) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError(
        "A student already uses this email within the organisation - Either change the student email or leave it blank",
        409
      );
    }
  }

  const newStudent = await Student.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      customId,
      fullName,
      studentGender,
      email,
      dateOfBirth,
      nationality,
      nextOfKinName,
      nextOfKinEmail
    ])
  });

  if (!newStudent) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, studentExists]) }
    ]);
    throwError("Error creating student profile", 500);
  }
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Student Profile Creation",
      "Student",
      newStudent?._id,
      fullName,
      [
        {
          kind: "N",
          rhs: {
            _id: newStudent._id,
            studentId: newStudent.customId,
            fullName
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
      value: getObjectSize(newStudent) * 2
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([newStudent, studentExists, organisation, role, account])
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { _id, customId, fullName, dateOfBirth, studentGender, email, nationality, nextOfKinName, nextOfKinEmail } =
    body;

  if (!validateStudentProfile(body)) {
    throwError("Please fill in all required fields", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const orgHasRequiredFeature = organisation?.features
    ?.map((feature) => feature.name)
    .includes("Student Profile & Enrollment");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Profile & Enrollment to use it",
      403
    );
  }
  // confirm organisation
  const orgParsedId = account!.organisationId!.toString();

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Student Profile");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit student - Please contact your admin", 403);
  }
  let emailInUse;
  if (email) {
    emailInUse = await Student.findOne({ organisationId: orgParsedId, email }).lean();

    if (emailInUse && emailInUse._id.toString() !== _id) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError(
        "A student already uses this email within the organisation - Either change the student email or leave it blank",
        409
      );
    }
  }

  const originalStudent = await Student.findById(_id).lean();

  if (!originalStudent) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, emailInUse]) }
    ]);
    throwError("An error occured whilst getting old student data", 500);
  }

  const updatedStudent = await Student.findByIdAndUpdate(
    originalStudent?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([
        customId,
        fullName,
        studentGender,
        email,
        dateOfBirth,
        nationality,
        nextOfKinName,
        nextOfKinEmail
      ])
    },
    { new: true }
  ).lean();

  if (!updatedStudent) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, emailInUse, originalStudent])
      }
    ]);
    throwError("Error updating student profile", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalStudent, updatedStudent);
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Student Profile Update",
      "Student",
      updatedStudent?._id,
      fullName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([updatedStudent, organisation, role, account, emailInUse, originalStudent])
    }
  ]);
  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { _id } = req.body;
  if (!_id) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const orgHasRequiredFeature = organisation?.features
    ?.map((feature) => feature.name)
    .includes("Student Profile & Enrollment");
  if (!orgHasRequiredFeature) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Student Profile");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to delete student profile - Please contact your admin",
      403
    );
  }

  const deletedStudentProfile = await Student.findByIdAndDelete(_id).lean();
  if (!deletedStudentProfile) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting student profile - Please try again", 500);
  }

  const emitRoom = deletedStudentProfile?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "students", deletedStudentProfile, "delete");

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Student Delete",
      "Student",
      deletedStudentProfile?._id,
      deletedStudentProfile?.fullName,
      [
        {
          kind: "D" as any,
          lhs: {
            _id: deletedStudentProfile?._id,
            customId: deletedStudentProfile?.customId,
            fullName: deletedStudentProfile?.fullName,
            email: deletedStudentProfile?.email,
            nextOfKinName: deletedStudentProfile?.nextOfKinName,
            qualifications: deletedStudentProfile?.qualifications
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 5 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: toNegative(getObjectSize(deletedStudentProfile) * 2)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([deletedStudentProfile, organisation, role, account])
    }
  ]);
  res.status(201).json("successfull");
});
