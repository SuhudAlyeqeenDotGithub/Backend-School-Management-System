import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  throwError,
  generateSearchText,
  fetchCourseManagers,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllCourseManagers,
  getObjectSize,
  toNegative
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";
import { StaffContract } from "../../../models/staff/contracts";
import { CourseManager } from "../../../models/curriculum/course";
import { registerBillings } from "utils/billingFunctions";

const validateCourseManager = (courseManagerDataParam: any) => {
  const { managedUntil, _id, ...copyLocalData } = courseManagerDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllCourseManagers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Course Managers");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchAllCourseManagers(organisation!._id.toString());

    if (!result) {
      throwError("Error fetching course managers", 500);
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

  throwError("Unauthorised Action: You do not have access to view course managers - Please contact your admin", 403);
});

export const getCourseManagers = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, accountStatus, courseId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Course Managers");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchCourseManagers(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      staffId
    );

    if (!result || !result.courseManagers) {
      throwError("Error fetching course managers", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.courseManagers.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view course managers - Please contact your admin", 403);
});

// controller to handle role creation
export const createCourseManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;

  const { courseCustomId, status, courseId, courseFullTitle, courseManagerCustomStaffId, courseManagerFullName } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const staffHasContract = await StaffContract.findOne({
    organisationId: orgParsedId,
    staffCustomId: courseManagerCustomStaffId
  });
  if (!staffHasContract) {
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }

  let courseAlreadyManaged;
  if (status === "Active") {
    courseAlreadyManaged = await CourseManager.findOne({
      organisationId: orgParsedId,
      courseId,
      courseManagerCustomStaffId,
      status: "Active"
    });
    if (courseAlreadyManaged) {
      throwError(
        "The staff is already an active manager of this course - Please assign another staff or deactivate their current management, or set this current one to inactive",
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Course Manager");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create course manager - Please contact your admin", 403);
  }

  const newCourseManager = await CourseManager.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([courseCustomId, courseFullTitle, courseManagerCustomStaffId, courseManagerFullName])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Course Manager Creation",
      "CourseManager",
      newCourseManager?._id,
      courseManagerFullName,
      [
        {
          kind: "N",
          rhs: newCourseManager
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 6 + (logActivityAllowed ? 2 : 0) + (status === "Active" ? 1 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newCourseManager) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newCourseManager, staffHasContract, organisation, role, account]) +
        (status === "Active" ? getObjectSize(courseAlreadyManaged) : 0) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateCourseManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const { courseCustomId, courseId, status, courseFullTitle, courseManagerCustomStaffId, courseManagerFullName } = body;

  if (!validateCourseManager(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Course Manager");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit course manager - Please contact your admin", 403);
  }

  const originalCourseManager = await CourseManager.findOne({ _id: body._id });

  if (!originalCourseManager) {
    throwError("An error occured whilst getting old course manager data, Ensure it has not been deleted", 500);
  }

  const updatedCourseManager = await CourseManager.findByIdAndUpdate(
    originalCourseManager?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([
        courseCustomId,
        courseFullTitle,
        courseManagerCustomStaffId,
        courseManagerFullName
      ])
    },
    { new: true }
  );

  if (!updatedCourseManager) {
    throwError("Error updating course", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalCourseManager, updatedCourseManager);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Course Manager Update",
      "CourseManager",
      updatedCourseManager?._id,
      courseFullTitle,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedCourseManager, organisation, role, account, originalCourseManager]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteCourseManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { courseManagerId } = req.body;
  if (!courseManagerId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Course Manager");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete course manager - Please contact your admin", 403);
  }

  const courseManagerToDelete = await CourseManager.findOne({
    _id: courseManagerId
  });

  if (!courseManagerToDelete) {
    throwError("Error finding course Manager with provided Custom Id - Please try again", 404);
  }

  const deletedCourseManager = await CourseManager.findByIdAndDelete(courseManagerToDelete?._id.toString());
  if (!deletedCourseManager) {
    throwError("Error deleting course Manager - Please try again", 500);
  }

  const emitRoom = deletedCourseManager?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "coursemanagers", deletedCourseManager, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Course Manager Deletion",
      "CourseManager",
      deletedCourseManager?._id,
      deletedCourseManager?.courseManagerFullName,
      [
        {
          kind: "D" as any,
          lhs: deletedCourseManager
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
      value: toNegative(getObjectSize(deletedCourseManager) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedCourseManager, organisation, role, account, courseManagerToDelete]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
