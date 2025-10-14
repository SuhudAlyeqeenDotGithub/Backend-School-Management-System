import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../../models/admin/accountModel";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchSubjects,
  generateCustomId,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  validateEmail,
  validatePhoneNumber,
  fetchAllSubjects
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";

import { Subject } from "../../../models/curriculum/subject";
import { Course } from "../../../models/curriculum/course";
import { Level } from "../../../models/curriculum/level";
import { BaseSubject } from "../../../models/curriculum/basesubject";

const validateSubject = (subjectDataParam: any) => {
  const { description, subjectDuration, courseName, ...copyLocalData } = subjectDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllSubjects = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, accountStatus, subjectId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Subjects");

  if (absoluteAdmin || hasAccess) {
    const subjectProfiles = await fetchAllSubjects(organisation!._id.toString());

    if (!subjectProfiles) {
      throwError("Error fetching subject profiles", 500);
    }
    res.status(201).json(subjectProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view subject - Please contact your admin", 403);
});

export const getSubjects = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, accountStatus, subjectId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Subjects");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchSubjects(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.subjects) {
      throwError("Error fetching subjects", 500);
    }
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view subject- Please contact your admin", 403);
});

// controller to handle role creation
export const createSubject = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { subjectCustomId, subject, courseCustomId, subjectFullTitle, levelCustomId, baseSubjectCustomId } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Subject");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create subject - Please contact your admin", 403);
  }

  const subjectExists = await Subject.findOne({ organisationId: orgParsedId, subjectCustomId });
  if (subjectExists) {
    throwError(
      "A subject with this Custom Id already exist - Either refer to that record or change the subject custom Id",
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

  const baseSubjectExists = await BaseSubject.findOne({ organisationId: orgParsedId, baseSubjectCustomId });
  if (!baseSubjectExists) {
    throwError(
      "No base subject with the provided Custom Id exist - Please create the base subject or change the base subject custom Id",
      409
    );
  }

  const newSubject = await Subject.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([subjectCustomId, subject, subjectFullTitle, courseCustomId, levelCustomId])
  });

  await logActivity(
    account?.organisationId,
    accountId,
    "Subject Creation",
    "Subject",
    newSubject?._id,
    subject,
    [
      {
        kind: "N",
        rhs: {
          _id: newSubject._id,
          subjectId: newSubject.subjectCustomId,
          subject
        }
      }
    ],
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateSubject = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { subjectCustomId, subject, courseCustomId, subjectFullTitle, levelCustomId, baseSubjectCustomId } = body;

  if (!validateSubject(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Subject");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit subject - Please contact your admin", 403);
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

  const baseSubjectExists = await BaseSubject.findOne({ organisationId: orgParsedId, baseSubjectCustomId });
  if (!baseSubjectExists) {
    throwError(
      "No base subject with the provided Custom Id exist - Please create the base subject or change the base subject custom Id",
      409
    );
  }

  const originalSubject = await Subject.findOne({ organisationId: orgParsedId, subjectCustomId });

  if (!originalSubject) {
    throwError("An error occured whilst getting old subject data, Ensure it has not been deleted", 500);
  }

  const updatedSubject = await Subject.findByIdAndUpdate(
    originalSubject?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([subjectCustomId, subject, subjectFullTitle, courseCustomId, levelCustomId])
    },
    { new: true }
  );

  if (!updatedSubject) {
    throwError("Error updating subject", 500);
  }

  const difference = diff(originalSubject, updatedSubject);

  await logActivity(
    account?.organisationId,
    accountId,
    "Subject Update",
    "Subject",
    updatedSubject?._id,
    subject,
    difference,
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteSubject = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { subjectCustomId } = req.body;
  if (!subjectCustomId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Subject");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete subject - Please contact your admin", 403);
  }

  const subjectToDelete = await Subject.findOne({
    organisationId: organisation?._id.toString(),
    subjectCustomId: subjectCustomId
  });

  if (!subjectToDelete) {
    throwError("Error finding subject with provided Custom Id - Please try again", 404);
  }

  const deletedSubject = await Subject.findByIdAndDelete(subjectToDelete?._id.toString());
  if (!deletedSubject) {
    throwError("Error deleting subject - Please try again", 500);
  }

  const emitRoom = deletedSubject?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "subjects", deletedSubject, "delete");

  await logActivity(
    account?.organisationId,
    accountId,
    "Subject Delete",
    "Subject",
    deletedSubject?._id,
    deletedSubject?.subject,
    [
      {
        kind: "D" as any,
        lhs: deletedSubject
      }
    ],
    new Date()
  );
  res.status(201).json("successfull");
});
