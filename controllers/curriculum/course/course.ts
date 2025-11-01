import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../../models/admin/accountModel";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchCourses,
  generateCustomId,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  validateEmail,
  validatePhoneNumber,
  fetchAllCourses
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";

import { Course } from "../../../models/curriculum/course";
import { Programme } from "../../../models/curriculum/programme";

const validateCourse = (courseDataParam: any) => {
  const { description, courseDuration, programmeName, ...copyLocalData } = courseDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllCourses = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, accountStatus, courseId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Courses");

  if (absoluteAdmin || hasAccess) {
    const courseProfiles = await fetchAllCourses(organisation!._id.toString());

    if (!courseProfiles) {
      throwError("Error fetching course profiles", 500);
    }
    res.status(201).json(courseProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view courses - Please contact your admin", 403);
});

export const getCourses = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, accountStatus, courseId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Courses");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchCourses(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.courses) {
      throwError("Error fetching courses", 500);
    }
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view course profile - Please contact your admin", 403);
});

// controller to handle role creation
export const createCourse = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;

  const { courseCustomId, courseName, programmeCustomId, courseFullTitle } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Course");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create course - Please contact your admin", 403);
  }

  const courseExists = await Course.findOne({ organisationId: orgParsedId, courseCustomId });
  if (courseExists) {
    throwError(
      "A course with this Custom Id already exist - Either refer to that record or change the course custom Id",
      409
    );
  }

  const programmeExists = await Programme.findOne({ organisationId: orgParsedId, programmeCustomId });
  if (!programmeExists) {
    throwError(
      "No programme with the provided Custom Id exist - Please create the programme or change the programme custom Id",
      409
    );
  }

  const newCourse = await Course.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([courseCustomId, courseName, courseFullTitle])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Course Creation",
      "Course",
      newCourse?._id,
      courseName,
      [
        {
          kind: "N",
          rhs: {
            _id: newCourse._id,
            courseId: newCourse.courseCustomId,
            courseName
          }
        }
      ],
      new Date()
    );
  }

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const { courseCustomId, courseName, programmeCustomId, courseFullTitle } = body;

  if (!validateCourse(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Course");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit course - Please contact your admin", 403);
  }

  const programmeExists = await Programme.findOne({ organisationId: orgParsedId, programmeCustomId });
  if (!programmeExists) {
    throwError(
      "No programme with the provided Custom Id exist - Please create the programme or change the programme custom Id",
      409
    );
  }

  const originalCourse = await Course.findOne({ organisationId: orgParsedId, courseCustomId });

  if (!originalCourse) {
    throwError("An error occured whilst getting old course data, Ensure it has not been deleted", 500);
  }

  const updatedCourse = await Course.findByIdAndUpdate(
    originalCourse?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([courseCustomId, courseName, courseFullTitle])
    },
    { new: true }
  );

  if (!updatedCourse) {
    throwError("Error updating course", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalCourse, updatedCourse);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Course Update",
      "Course",
      updatedCourse?._id,
      courseName,
      difference,
      new Date()
    );
  }

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteCourse = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { courseCustomId } = req.body;
  if (!courseCustomId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Course Profile");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete course profile - Please contact your admin", 403);
  }

  const courseToDelete = await Course.findOne({
    organisationId: organisation?._id.toString(),
    courseCustomId: courseCustomId
  });

  if (!courseToDelete) {
    throwError("Error finding course with provided Custom Id - Please try again", 404);
  }

  const deletedCourse = await Course.findByIdAndDelete(courseToDelete?._id.toString());
  if (!deletedCourse) {
    throwError("Error deleting course - Please try again", 500);
  }

  const emitRoom = deletedCourse?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "courses", deletedCourse, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Course Delete",
      "Course",
      deletedCourse?._id,
      deletedCourse?.courseName,
      [
        {
          kind: "D" as any,
          lhs: deletedCourse
        }
      ],
      new Date()
    );
  }
  res.status(201).json("successfull");
});
