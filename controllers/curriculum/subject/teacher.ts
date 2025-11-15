import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  getObjectSize,
  toNegative,
  throwError,
  generateSearchText,
  fetchSubjectTeachers,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllSubjectTeachers
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";
import { StaffContract } from "../../../models/staff/contracts";
import { SubjectTeacher } from "../../../models/curriculum/subject";
import { registerBillings } from "utils/billingFunctions";

const validateSubjectTeacher = (subjectTeacherDataParam: any) => {
  const { managedUntil, _id, ...copyLocalData } = subjectTeacherDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllSubjectTeachers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Subject Teachers");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchAllSubjectTeachers(organisation!._id.toString());

    if (!result) {
      throwError("Error fetching subject teachers", 500);
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

  throwError("Unauthorised Action: You do not have access to view subject teachers - Please contact your admin", 403);
});

export const getSubjectTeachers = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Subject Teachers");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchSubjectTeachers(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      staffId
    );

    if (!result || !result.subjectTeachers) {
      throwError("Error fetching subject teachers", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.subjectTeachers.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view subject teachers - Please contact your admin", 403);
});

// controller to handle role creation
export const createSubjectTeacher = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;

  const { subjectCustomId, status, subjectId, subjectFullTitle, subjectTeacherCustomStaffId, subjectTeacherFullName } =
    body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const staffHasContract = await StaffContract.findOne({
    organisationId: orgParsedId,
    staffCustomId: subjectTeacherCustomStaffId
  });
  if (!staffHasContract) {
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }

  let subjectAlreadyManaged;
  if (status === "Active") {
    subjectAlreadyManaged = await SubjectTeacher.findOne({
      organisationId: orgParsedId,
      subjectId,
      subjectTeacherCustomStaffId,
      status: "Active"
    });
    if (subjectAlreadyManaged) {
      throwError(
        "The staff is already an active teacher of this subject - Please assign another staff or deactivate their current management, or set this current one to inactive",
        409
      );
    }
  }

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Subject Teacher");

  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create subject teacher - Please contact your admin",
      403
    );
  }

  const newSubjectTeacher = await SubjectTeacher.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      subjectCustomId,
      subjectFullTitle,
      subjectTeacherCustomStaffId,
      subjectTeacherFullName
    ])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Subject Teacher Creation",
      "SubjectTeacher",
      newSubjectTeacher?._id,
      subjectTeacherFullName,
      [
        {
          kind: "N",
          rhs: newSubjectTeacher
        }
      ],
      new Date()
    );
  }
  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 4 + (logActivityAllowed ? 2 : 0) + (status === "Active" ? 1 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newSubjectTeacher) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newSubjectTeacher, staffHasContract, organisation, role, account]) +
        (status === "Active" ? getObjectSize(subjectAlreadyManaged) : 0) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateSubjectTeacher = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const { subjectCustomId, subjectId, status, subjectFullTitle, subjectTeacherCustomStaffId, subjectTeacherFullName } =
    body;

  if (!validateSubjectTeacher(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Subject Teacher");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit subject teacher - Please contact your admin", 403);
  }

  const originalSubjectTeacher = await SubjectTeacher.findOne({ _id: body._id });

  if (!originalSubjectTeacher) {
    throwError("An error occured whilst getting old subject teacher data, Ensure it has not been deleted", 500);
  }

  const updatedSubjectTeacher = await SubjectTeacher.findByIdAndUpdate(
    originalSubjectTeacher?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([
        subjectCustomId,
        subjectFullTitle,
        subjectTeacherCustomStaffId,
        subjectTeacherFullName
      ])
    },
    { new: true }
  );

  if (!updatedSubjectTeacher) {
    throwError("Error updating subject", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalSubjectTeacher, updatedSubjectTeacher);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Subject Teacher Update",
      "SubjectTeacher",
      updatedSubjectTeacher?._id,
      subjectFullTitle,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedSubjectTeacher, organisation, role, account, originalSubjectTeacher]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteSubjectTeacher = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { subjectTeacherId } = req.body;
  if (!subjectTeacherId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Subject Teacher");
  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to delete subject teacher - Please contact your admin",
      403
    );
  }

  const subjectTeacherToDelete = await SubjectTeacher.findOne({
    _id: subjectTeacherId
  });

  if (!subjectTeacherToDelete) {
    throwError("Error finding subject Teacher with provided Custom Id - Please try again", 404);
  }

  const deletedSubjectTeacher = await SubjectTeacher.findByIdAndDelete(subjectTeacherToDelete?._id.toString());
  if (!deletedSubjectTeacher) {
    throwError("Error deleting subject teacher - Please try again", 500);
  }

  const emitRoom = deletedSubjectTeacher?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "subjectteachers", deletedSubjectTeacher, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Subject Teacher Deletion",
      "SubjectTeacher",
      deletedSubjectTeacher?._id,
      deletedSubjectTeacher?.subjectTeacherFullName,
      [
        {
          kind: "D" as any,
          lhs: deletedSubjectTeacher
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
        value: toNegative(getObjectSize(deletedSubjectTeacher) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
      },
      {
        field: "databaseDataTransfer",
        value:
          getObjectSize([deletedSubjectTeacher, organisation, role, account, subjectTeacherToDelete]) +
          (logActivityAllowed ? getObjectSize(activityLog) : 0)
      }
    ]);
  res.status(201).json("successfull");
});
