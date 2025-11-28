import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  getObjectSize,
  toNegative,
  throwError,
  generateSearchText,
  fetchProgrammes,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllProgrammes
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";

import { Programme } from "../../../models/curriculum/programme";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { VerificationCode } from "../../../models/authentication/resetPasswordModel.ts";

const validateProgramme = (programmeDataParam: any) => {
  const { description, programmeDuration, ...copyLocalData } = programmeDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllProgrammes = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Programmes");

  if (absoluteAdmin || hasAccess) {
    const programmeProfiles = await fetchAllProgrammes(organisation!._id.toString());

    if (!programmeProfiles) {
      throwError("Error fetching programme", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + programmeProfiles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([programmeProfiles, organisation, role, account])
      }
    ]);
    res.status(201).json(programmeProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view programme - Please contact your admin", 403);
});

export const getProgrammes = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Programmes");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchProgrammes(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.programmes) {
      throwError("Error fetching programmes", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.programmes.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view programme - Please contact your admin", 403);
});

// controller to handle role creation
export const createProgramme = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;

  const { programmeCustomId, programmeName } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Programme");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create programme - Please contact your admin", 403);
  }

  const programmeExists = await Programme.findOne({ organisationId: orgParsedId, programmeCustomId });
  if (programmeExists) {
    throwError(
      "A programme with this Custom Id already exist - Either refer to that record or change the programme custom Id",
      409
    );
  }

  const newProgramme = await Programme.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([programmeCustomId, programmeName])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Programme Creation",
      "Programme",
      newProgramme?._id,
      programmeName,
      [
        {
          kind: "N",
          rhs: {
            _id: newProgramme._id,
            programmeId: newProgramme.programmeCustomId,
            programmeName
          }
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
      value: (getObjectSize(newProgramme) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newProgramme, programmeExists, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateProgramme = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { programmeCustomId, programmeName } = body;

  if (!validateProgramme(body)) {
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

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Programme");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit programme - Please contact your admin", 403);
  }

  const originalProgramme = await Programme.findOne({ organisationId: orgParsedId, programmeCustomId });

  if (!originalProgramme) {
    throwError("An error occured whilst getting old programme data, Ensure it has not been deleted", 500);
  }

  const updatedProgramme = await Programme.findByIdAndUpdate(
    originalProgramme?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([programmeCustomId, programmeName])
    },
    { new: true }
  );

  if (!updatedProgramme) {
    throwError("Error updating programme", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalProgramme, updatedProgramme);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Programme Update",
      "Programme",
      updatedProgramme?._id,
      programmeName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedProgramme, organisation, role, account, originalProgramme]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteProgramme = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { programmeCustomId } = req.body;
  if (!programmeCustomId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Programme");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete programme - Please contact your admin", 403);
  }

  const programmeToDelete = await Programme.findOne({
    organisationId: organisation?._id.toString(),
    programmeCustomId: programmeCustomId
  });

  if (!programmeToDelete) {
    throwError("Error finding programme with provided Custom Id - Please try again", 404);
  }

  const deletedProgramme = await Programme.findByIdAndDelete(programmeToDelete?._id.toString());
  if (!deletedProgramme) {
    throwError("Error deleting programme - Please try again", 500);
  }

  const emitRoom = deletedProgramme?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "programmes", deletedProgramme, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Programme Delete",
      "Programme",
      deletedProgramme?._id,
      deletedProgramme?.programmeName,
      [
        {
          kind: "D" as any,
          lhs: deletedProgramme
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
      value: toNegative(getObjectSize(deletedProgramme) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedProgramme, organisation, role, account, programmeToDelete]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
