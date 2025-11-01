import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  throwError,
  generateSearchText,
  fetchLevelManagers,
  generateCustomId,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  validateEmail,
  validatePhoneNumber,
  fetchAllLevelManagers
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";
import { StaffContract } from "../../../models/staff/contracts";
import { LevelManager } from "../../../models/curriculum/level";

const validateLevelManager = (levelManagerDataParam: any) => {
  const { managedUntil, _id, ...copyLocalData } = levelManagerDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllLevelManagers = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, accountStatus, courseId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Level Managers");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchAllLevelManagers(organisation!._id.toString());

    if (!result) {
      throwError("Error fetching level managers", 500);
    }
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view level managers - Please contact your admin", 403);
});

export const getLevelManagers = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, accountStatus, levelId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Level Managers");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchLevelManagers(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      staffId
    );

    if (!result || !result.levelManagers) {
      throwError("Error fetching level managers", 500);
    }
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view level managers - Please contact your admin", 403);
});

// controller to handle role creation
export const createLevelManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;

  const { levelCustomId, status, levelId, levelFullTitle, levelManagerCustomStaffId, levelManagerFullName } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const staffHasContract = await StaffContract.findOne({
    organisationId: orgParsedId,
    staffCustomId: levelManagerCustomStaffId
  });
  if (!staffHasContract) {
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }

  if (status === "Active") {
    const levelAlreadyManaged = await LevelManager.findOne({
      organisationId: orgParsedId,
      levelId,
      levelManagerCustomStaffId,
      status: "Active"
    });
    if (levelAlreadyManaged) {
      throwError(
        "The staff is already an active manager of this level - Please assign another staff or deactivate their current management, or set this current one to inactive",
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Level Manager");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create level manager - Please contact your admin", 403);
  }

  const newLevelManager = await LevelManager.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([levelCustomId, levelFullTitle, levelManagerCustomStaffId, levelManagerFullName])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Level Manager Creation",
      "LevelManager",
      newLevelManager?._id,
      levelManagerFullName,
      [
        {
          kind: "N",
          rhs: newLevelManager
        }
      ],
      new Date()
    );
  }

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateLevelManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const { levelCustomId, levelId, status, levelFullTitle, levelManagerCustomStaffId, levelManagerFullName } = body;

  if (!validateLevelManager(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Level Manager");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit level manager - Please contact your admin", 403);
  }

  const originalLevelManager = await LevelManager.findOne({ _id: body._id });

  if (!originalLevelManager) {
    throwError("An error occured whilst getting old level manager data, Ensure it has not been deleted", 500);
  }

  const updatedLevelManager = await LevelManager.findByIdAndUpdate(
    originalLevelManager?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([levelCustomId, levelFullTitle, levelManagerCustomStaffId, levelManagerFullName])
    },
    { new: true }
  );

  if (!updatedLevelManager) {
    throwError("Error updating level", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalLevelManager, updatedLevelManager);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Level Manager Update",
      "LevelManager",
      updatedLevelManager?._id,
      levelFullTitle,
      difference,
      new Date()
    );
  }

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteLevelManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { levelManagerId } = req.body;
  if (!levelManagerId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Level Manager");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete level manager - Please contact your admin", 403);
  }

  const levelManagerToDelete = await LevelManager.findOne({
    _id: levelManagerId
  });

  if (!levelManagerToDelete) {
    throwError("Error finding level Manager with provided Custom Id - Please try again", 404);
  }

  const deletedLevelManager = await LevelManager.findByIdAndDelete(levelManagerToDelete?._id.toString());
  if (!deletedLevelManager) {
    throwError("Error deleting level Manager - Please try again", 500);
  }

  const emitRoom = deletedLevelManager?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "levelmanagers", deletedLevelManager, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Level Manager Deletion",
      "LevelManager",
      deletedLevelManager?._id,
      deletedLevelManager?.levelManagerFullName,
      [
        {
          kind: "D" as any,
          lhs: deletedLevelManager
        }
      ],
      new Date()
    );
  }
  res.status(201).json("successfull");
});
