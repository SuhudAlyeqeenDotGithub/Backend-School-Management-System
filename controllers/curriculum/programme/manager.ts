import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  throwError,
  generateSearchText,
  fetchProgrammeManagers,
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
import { ProgrammeManager } from "../../../models/curriculum/programme";

const validateProgrammeManager = (programmeManagerDataParam: any) => {
  const { managedUntil, _id, ...copyLocalData } = programmeManagerDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getProgrammeManagers = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, accountStatus, programmeId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Programme Managers");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchProgrammeManagers(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      staffId
    );

    if (!result || !result.programmeManagers) {
      throwError("Error fetching programme managers", 500);
    }
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view programme profile - Please contact your admin", 403);
});

// controller to handle role creation
export const createProgrammeManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const {
    programmeCustomId,
    status,
    programmeId,
    programmeName,
    programmeManagerCustomStaffId,
    programmeManagerFullName
  } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const staffHasContract = await StaffContract.findOne({
    organisationId: orgParsedId,
    staffCustomId: programmeManagerCustomStaffId
  });
  if (!staffHasContract) {
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }

  if (status === "Active") {
    const programmeAlreadyManaged = await ProgrammeManager.findOne({
      organisationId: orgParsedId,
      programmeId,
      programmeManagerCustomStaffId,
      status: "Active"
    });
    if (programmeAlreadyManaged) {
      throwError(
        "The staff is already an active manager of this programme - Please assign another staff or deactivate their current management",
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Programme Manager");

  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to create programme manager - Please contact your admin",
      403
    );
  }

  const newProgrammeManager = await ProgrammeManager.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      programmeCustomId,
      programmeName,
      programmeManagerCustomStaffId,
      programmeManagerFullName
    ])
  });

  await logActivity(
    account?.organisationId,
    accountId,
    "Programme Manager Creation",
    "ProgrammeManager",
    newProgrammeManager?._id,
    programmeManagerFullName,
    [
      {
        kind: "N",
        rhs: newProgrammeManager
      }
    ],
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateProgrammeManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const {
    programmeCustomId,
    programmeId,
    status,
    programmeName,
    programmeManagerCustomStaffId,
    programmeManagerFullName
  } = body;

  if (!validateProgrammeManager(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Programme Manager");

  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to edit programme manager - Please contact your admin",
      403
    );
  }

  const originalProgrammeManager = await ProgrammeManager.findOne({ _id: body._id });

  if (!originalProgrammeManager) {
    throwError("An error occured whilst getting old programme manager data, Ensure it has not been deleted", 500);
  }

  if (status === "Active") {
    const programmeAlreadyManaged = await ProgrammeManager.findOne({
      organisationId: orgParsedId,
      programmeId,
      programmeManagerCustomStaffId,
      status: "Active"
    });
    if (programmeAlreadyManaged) {
      throwError(
        "The staff is already an active manager of this programme - Please assign another staff or deactivate their current management",
        409
      );
    }
  }

  const updatedProgrammeManager = await ProgrammeManager.findByIdAndUpdate(
    originalProgrammeManager?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([
        programmeCustomId,
        programmeName,
        programmeManagerCustomStaffId,
        programmeManagerFullName
      ])
    },
    { new: true }
  );

  if (!updatedProgrammeManager) {
    throwError("Error updating programme", 500);
  }

  const difference = diff(originalProgrammeManager, updatedProgrammeManager);

  await logActivity(
    account?.organisationId,
    accountId,
    "ProgrammeManager Update",
    "ProgrammeManager",
    updatedProgrammeManager?._id,
    programmeName,
    difference,
    new Date()
  );

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteProgrammeManager = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { programmeManagerId } = req.body;
  if (!programmeManagerId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Programme Manager");
  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to delete programme manager - Please contact your admin",
      403
    );
  }

  const programmeManagerToDelete = await ProgrammeManager.findOne({
    _id: programmeManagerId
  });

  if (!programmeManagerToDelete) {
    throwError("Error finding programme Manager with provided Custom Id - Please try again", 404);
  }

  const deletedProgrammeManager = await ProgrammeManager.findByIdAndDelete(programmeManagerToDelete?._id.toString());
  if (!deletedProgrammeManager) {
    throwError("Error deleting programme Manager - Please try again", 500);
  }

  const emitRoom = deletedProgrammeManager?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "programmemanagers", deletedProgrammeManager, "delete");

  await logActivity(
    account?.organisationId,
    accountId,
    "Programme Manager Deletion",
    "ProgrammeManager",
    deletedProgrammeManager?._id,
    deletedProgrammeManager?.programmeManagerFullName,
    [
      {
        kind: "D" as any,
        lhs: deletedProgrammeManager
      }
    ],
    new Date()
  );
  res.status(201).json("successfull");
});
