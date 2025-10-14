import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  throwError,
  generateSearchText,
  fetchSyllabuses,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllSyllabuses
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";

import { Syllabus } from "../../../models/curriculum/syllabus";

const validateSyllabus = (syllabusDataParam: any) => {
  const {
    description,
    syllabusDuration,
    offeringStartDate,
    offeringEndDate,
    topics,
    learningOutcomes,
    notes,
    ...copyLocalData
  } = syllabusDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllSyllabuses = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, accountStatus, syllabusId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Syllabuses");

  if (absoluteAdmin || hasAccess) {
    const syllabusProfiles = await fetchAllSyllabuses(organisation!._id.toString());

    if (!syllabusProfiles) {
      throwError("Error fetching syllabus", 500);
    }
    res.status(201).json(syllabusProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view syllabus- Please contact your admin", 403);
});

export const getSyllabuses = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, accountStatus, syllabusId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Syllabuses");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchSyllabuses(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.syllabuses) {
      throwError("Error fetching syllabuses", 500);
    }
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view syllabus- Please contact your admin", 403);
});

// controller to handle role creation
export const createSyllabus = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const {
    syllabusCustomId,
    syllabus,
    subjectFullTitle,
    courseCustomId,
    levelCustomId,
    baseSubjectCustomId,
    subjectCustomId
  } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Syllabus");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create syllabus - Please contact your admin", 403);
  }

  const syllabusExists = await Syllabus.findOne({ organisationId: orgParsedId, syllabusCustomId });
  if (syllabusExists) {
    throwError(
      "A syllabus with this Custom Id already exist - Either refer to that record or change the syllabus custom Id",
      409
    );
  }

  const newSyllabus = await Syllabus.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      syllabusCustomId,
      syllabus,
      subjectFullTitle,
      courseCustomId,
      levelCustomId,
      baseSubjectCustomId,
      subjectCustomId
    ])
  });

  await logActivity(
    account?.organisationId,
    accountId,
    "Syllabus Creation",
    "Syllabus",
    newSyllabus?._id,
    syllabus,
    [
      {
        kind: "N",
        rhs: {
          _id: newSyllabus._id,
          syllabusId: newSyllabus.syllabusCustomId,
          syllabus
        }
      }
    ],
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateSyllabus = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const {
    syllabusCustomId,
    syllabus,
    subjectFullTitle,
    courseCustomId,
    levelCustomId,
    baseSubjectCustomId,
    subjectCustomId
  } = body;

  if (!validateSyllabus(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Syllabus");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit syllabus - Please contact your admin", 403);
  }

  const originalSyllabus = await Syllabus.findOne({ organisationId: orgParsedId, syllabusCustomId });

  if (!originalSyllabus) {
    throwError("An error occured whilst getting old syllabus data, Ensure it has not been deleted", 500);
  }

  const updatedSyllabus = await Syllabus.findByIdAndUpdate(
    originalSyllabus?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([
        syllabusCustomId,
        syllabus,
        subjectFullTitle,
        courseCustomId,
        levelCustomId,
        baseSubjectCustomId,
        subjectCustomId
      ])
    },
    { new: true }
  );

  if (!updatedSyllabus) {
    throwError("Error updating syllabus", 500);
  }

  const difference = diff(originalSyllabus, updatedSyllabus);

  await logActivity(
    account?.organisationId,
    accountId,
    "Syllabus Update",
    "Syllabus",
    updatedSyllabus?._id,
    syllabus,
    difference,
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteSyllabus = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { syllabusCustomId } = req.body;
  if (!syllabusCustomId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Syllabus");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete syllabus - Please contact your admin", 403);
  }

  const syllabusToDelete = await Syllabus.findOne({
    organisationId: organisation?._id.toString(),
    syllabusCustomId: syllabusCustomId
  });

  if (!syllabusToDelete) {
    throwError("Error finding syllabus with provided Custom Id - Please try again", 404);
  }

  const deletedSyllabus = await Syllabus.findByIdAndDelete(syllabusToDelete?._id.toString());
  if (!deletedSyllabus) {
    throwError("Error deleting syllabus - Please try again", 500);
  }

  const emitRoom = deletedSyllabus?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "syllabuses", deletedSyllabus, "delete");

  await logActivity(
    account?.organisationId,
    accountId,
    "Syllabus Delete",
    "Syllabus",
    deletedSyllabus?._id,
    deletedSyllabus?.syllabus,
    [
      {
        kind: "D" as any,
        lhs: deletedSyllabus
      }
    ],
    new Date()
  );
  res.status(201).json("successfull");
});
