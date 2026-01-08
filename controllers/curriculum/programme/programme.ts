import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchProgrammes,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllProgrammes,
  checkAccesses
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";
import { Programme } from "../../../models/curriculum/programme";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { getNeededAccesses } from "../../../utils/defaultVariables.ts";

const validateProgramme = (programmeDataParam: any) => {
  const { description, duration, startDate, endDate, ...copyLocalData } = programmeDataParam;

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
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccesses(account, tabAccess, getNeededAccesses("All Programmes"));

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view programmes - Please contact your admin", 403);
  }

  const programmes = await fetchAllProgrammes(organisation!._id.toString());

  if (!programmes) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, programmes]) }
    ]);
    throwError("Error fetching programme", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + programmes.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([programmes, organisation, role, account])
    }
  ]);
  res.status(201).json(programmes);
  return;
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
    if (filters[key] !== "all" && filters[key] && filters[key] !== "undefined" && filters[key] !== "null") {
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
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "View Programmes");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view programmes - Please contact your admin", 403);
  }

  const result = await fetchProgrammes(query, cursorType as string, parsedLimit, organisation!._id.toString());

  if (!result || !result.programmes) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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
});

// controller to handle role creation
export const createProgramme = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { customId, programme } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Programme");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create programme - Please contact your admin", 403);
  }

  const programmeExists = await Programme.findOne({ organisationId: orgParsedId, customId }).lean();
  if (programmeExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "A programme with this Custom Id already exist within the organisation - Either refer to that record or change the programme custom Id",
      409
    );
  }

  const newProgramme = await Programme.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([customId, programme])
  });

  if (!newProgramme) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, newProgramme, programmeExists])
      }
    ]);
    throwError("Error creating programme", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Programme Creation",
      "Programme",
      newProgramme?._id,
      programme,
      [
        {
          kind: "N",
          rhs: {
            _id: newProgramme._id,
            programmeId: newProgramme.customId,
            programme
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
  const { customId, programme } = body;

  if (!validateProgramme(body)) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!.toString();

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Programme");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit programme - Please contact your admin", 403);
  }

  const originalProgramme = await Programme.findOne({ organisationId: orgParsedId, customId }).lean();

  if (!originalProgramme) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("An error occured whilst getting old programme data, Ensure it has not been deleted", 500);
  }

  const updatedProgramme = await Programme.findByIdAndUpdate(
    originalProgramme?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([customId, programme])
    },
    { new: true }
  ).lean();

  if (!updatedProgramme) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, originalProgramme, updatedProgramme])
      }
    ]);
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
      programme,
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
  const { accountId } = req.userToken;
  const { _id } = req.body;
  if (!_id) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Programme");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete programme - Please contact your admin", 403);
  }

  const deletedProgramme = await Programme.findByIdAndDelete(_id).lean();
  if (!deletedProgramme) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, deletedProgramme])
      }
    ]);
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
      deletedProgramme?.programme,
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
      value: 5 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: toNegative(getObjectSize(deletedProgramme) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedProgramme, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
