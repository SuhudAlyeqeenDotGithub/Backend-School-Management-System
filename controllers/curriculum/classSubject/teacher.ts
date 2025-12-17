import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchClassSubjectTeachers,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllClassSubjectTeachers
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { StaffContract } from "../../../models/staff/contracts.ts";
import { ClassSubjectTeacher } from "../../../models/curriculum/classSubject.ts";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";

const validateClassSubjectTeacher = (subjectTeacherDataParam: any) => {
  const { managedUntil, ...copyLocalData } = subjectTeacherDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllClassSubjectTeachers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

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
  const hasAccess = checkAccess(account, tabAccess, "View Class Subject Teachers");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete class subject - Please contact your admin", 403);
  }
  const result = await fetchAllClassSubjectTeachers(organisation!._id.toString());

  if (!result) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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
});

export const getClassSubjectTeachers = asyncHandler(async (req: Request, res: Response) => {
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
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "View Class Subject Teachers");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete class subject - Please contact your admin", 403);
  }
  const result = await fetchClassSubjectTeachers(
    query,
    cursorType as string,
    parsedLimit,
    absoluteAdmin ? "Absolute Admin" : "User",
    organisation!._id.toString(),
    staffId
  );

  if (!result || !result.classSubjectTeachers) {
    throwError("Error fetching subject teachers", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.classSubjectTeachers.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);
  res.status(201).json(result);
});

// controller to handle role creation
export const createClassSubjectTeacher = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { classSubjectId, staffId, teacherFullName, status } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create ClassSubject Teacher");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to create subject teacher - Please contact your admin",
      403
    );
  }

  const staffHasContract = await StaffContract.findOne(staffId).lean();
  if (!staffHasContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }

  let subjectAlreadyManaged;
  if (status === "Active") {
    subjectAlreadyManaged = await ClassSubjectTeacher.findOne({
      organisationId: orgParsedId,
      classSubjectId,
      staffId,
      status: "Active"
    }).lean();
    if (subjectAlreadyManaged) {
      registerBillings(req, [
        { field: "databaseOperation", value: 5 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([organisation, role, account, subjectAlreadyManaged, staffHasContract])
        }
      ]);
      throwError(
        "The staff is already an active teacher of this subject - Please assign another staff or deactivate their current management, or set this current one to inactive",
        409
      );
    }
  }

  const newClassSubjectTeacher = await ClassSubjectTeacher.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([classSubjectId, staffId, teacherFullName])
  });

  if (!newClassSubjectTeacher) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, staffHasContract]) }
    ]);
    throwError("Error creating subject teacher", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Class Subject Teacher Creation",
      "ClassSubjectTeacher",
      newClassSubjectTeacher?._id,
      teacherFullName,
      [
        {
          kind: "N",
          rhs: newClassSubjectTeacher
        }
      ],
      new Date()
    );
  }
  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 7 + (logActivityAllowed ? 2 : 0) + (status === "Active" ? 1 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newClassSubjectTeacher) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newClassSubjectTeacher, staffHasContract, organisation, role, account]) +
        (status === "Active" ? getObjectSize(subjectAlreadyManaged) : 0) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateClassSubjectTeacher = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { classSubjectId, staffId, teacherFullName, status } = body;

  if (!validateClassSubjectTeacher(body)) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit ClassSubject Teacher");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit subject teacher - Please contact your admin", 403);
  }

  const originalClassSubjectTeacher = await ClassSubjectTeacher.findOne({ _id: body._id }).lean();

  if (!originalClassSubjectTeacher) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("An error occured whilst getting old subject teacher data, Ensure it has not been deleted", 500);
  }

  const updatedClassSubjectTeacher = await ClassSubjectTeacher.findByIdAndUpdate(
    originalClassSubjectTeacher?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([classSubjectId, staffId, teacherFullName])
    },
    { new: true }
  ).lean();

  if (!updatedClassSubjectTeacher) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, originalClassSubjectTeacher])
      }
    ]);
    throwError("Error updating subject", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalClassSubjectTeacher, updatedClassSubjectTeacher);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Class Subject Teacher Update",
      "ClassSubjectTeacher",
      updatedClassSubjectTeacher?._id,
      teacherFullName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedClassSubjectTeacher, organisation, role, account, originalClassSubjectTeacher]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteClassSubjectTeacher = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { _id } = req.body;
  if (!_id) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete ClassSubject Teacher");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to delete subject teacher - Please contact your admin",
      403
    );
  }

  const deletedClassSubjectTeacher = await ClassSubjectTeacher.findByIdAndDelete(_id).lean();
  if (!deletedClassSubjectTeacher) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting subject teacher - Please try again", 500);
  }

  const emitRoom = deletedClassSubjectTeacher?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "subjectteachers", deletedClassSubjectTeacher, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "ClassSubject Teacher Deletion",
      "ClassSubjectTeacher",
      deletedClassSubjectTeacher?._id,
      deletedClassSubjectTeacher?.teacherFullName,
      [
        {
          kind: "D" as any,
          lhs: deletedClassSubjectTeacher
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
      value:
        toNegative(getObjectSize(deletedClassSubjectTeacher) * 2) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedClassSubjectTeacher, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
