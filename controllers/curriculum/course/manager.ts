import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  throwError,
  generateSearchText,
  fetchCourseManagers,
  generateCustomId,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  validateEmail,
  validatePhoneNumber
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";
import { StaffContract } from "../../../models/staff/contracts";
import { CourseManager } from "../../../models/curriculum/course";

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

export const getCourseManagers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { search = "", limit, cursorType, nextCursor, prevCursor, ...filters } = req.query;

  const parsedLimit = parseInt(limit as string);
  const query: any = {};

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
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view course profile - Please contact your admin", 403);
});

// controller to handle role creation
export const createCourseManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
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

  if (status === "Active") {
    const courseAlreadyManaged = await CourseManager.findOne({
      organisationId: orgParsedId,
      courseId,
      courseManagerCustomStaffId,
      status: "Active"
    });
    if (courseAlreadyManaged) {
      throwError(
        "The staff is already an active manager of this course - Please assign another staff or deactivate their current management",
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

  await logActivity(
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

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateCourseManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
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

  if (status === "Active") {
    const courseAlreadyManaged = await CourseManager.findOne({
      organisationId: orgParsedId,
      courseId,
      courseManagerCustomStaffId,
      status: "Active"
    });
    if (courseAlreadyManaged) {
      throwError(
        "The staff is already an active manager of this course - Please assign another staff or deactivate their current management",
        409
      );
    }
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

  const difference = diff(originalCourseManager, updatedCourseManager);

  await logActivity(
    account?.organisationId,
    accountId,
    "CourseManager Update",
    "CourseManager",
    updatedCourseManager?._id,
    courseFullTitle,
    difference,
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteCourseManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
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

  await logActivity(
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
  res.status(201).json("successfull");
});
