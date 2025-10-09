import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { Account } from "../../../models/admin/accountModel";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchLevels,
  generateCustomId,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  validateEmail,
  validatePhoneNumber,
  fetchAllLevels
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";

import { Level } from "../../../models/curriculum/level";
import { Course } from "../../../models/curriculum/course";

const validateLevel = (levelDataParam: any) => {
  const { description, levelDuration, courseName, ...copyLocalData } = levelDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllLevels = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, accountStatus, levelId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Levels");

  if (absoluteAdmin || hasAccess) {
    const levelProfiles = await fetchAllLevels(organisation!._id.toString());

    if (!levelProfiles) {
      throwError("Error fetching level profiles", 500);
    }
    res.status(201).json(levelProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view level profile - Please contact your admin", 403);
});

export const getLevels = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, accountStatus, levelId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Levels");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchLevels(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.levels) {
      throwError("Error fetching levels", 500);
    }
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view level profile - Please contact your admin", 403);
});

// controller to handle role creation
export const createLevel = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { levelCustomId, level, courseCustomId, levelFullTitle } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Level");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create level - Please contact your admin", 403);
  }

  const levelExists = await Level.findOne({ organisationId: orgParsedId, levelCustomId });
  if (levelExists) {
    throwError(
      "A level with this Custom Id already exist - Either refer to that record or change the level custom Id",
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

  const newLevel = await Level.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([levelCustomId, level, levelFullTitle])
  });

  await logActivity(
    account?.organisationId,
    accountId,
    "Level Creation",
    "Level",
    newLevel?._id,
    level,
    [
      {
        kind: "N",
        rhs: {
          _id: newLevel._id,
          levelId: newLevel.levelCustomId,
          level
        }
      }
    ],
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateLevel = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { levelCustomId, level, courseCustomId, levelFullTitle } = body;

  if (!validateLevel(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Level");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit level - Please contact your admin", 403);
  }

  const courseExists = await Course.findOne({ organisationId: orgParsedId, courseCustomId });
  if (!courseExists) {
    throwError(
      "No course with the provided Custom Id exist - Please create the course or change the course custom Id",
      409
    );
  }

  const originalLevel = await Level.findOne({ organisationId: orgParsedId, levelCustomId });

  if (!originalLevel) {
    throwError("An error occured whilst getting old level data, Ensure it has not been deleted", 500);
  }

  const updatedLevel = await Level.findByIdAndUpdate(
    originalLevel?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([levelCustomId, level, levelFullTitle])
    },
    { new: true }
  );

  if (!updatedLevel) {
    throwError("Error updating level", 500);
  }

  const difference = diff(originalLevel, updatedLevel);

  await logActivity(
    account?.organisationId,
    accountId,
    "Level Update",
    "Level",
    updatedLevel?._id,
    level,
    difference,
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteLevel = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { levelCustomId } = req.body;
  if (!levelCustomId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Level Profile");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete level profile - Please contact your admin", 403);
  }

  const levelToDelete = await Level.findOne({
    organisationId: organisation?._id.toString(),
    levelCustomId: levelCustomId
  });

  if (!levelToDelete) {
    throwError("Error finding level with provided Custom Id - Please try again", 404);
  }

  const deletedLevel = await Level.findByIdAndDelete(levelToDelete?._id.toString());
  if (!deletedLevel) {
    throwError("Error deleting level - Please try again", 500);
  }

  const emitRoom = deletedLevel?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "levels", deletedLevel, "delete");

  await logActivity(
    account?.organisationId,
    accountId,
    "Level Delete",
    "Level",
    deletedLevel?._id,
    deletedLevel?.level,
    [
      {
        kind: "D" as any,
        lhs: deletedLevel
      }
    ],
    new Date()
  );
  res.status(201).json("successfull");
});
