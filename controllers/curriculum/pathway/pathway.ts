import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchPathways,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllPathways
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";
import { Pathway } from "../../../models/curriculum/pathway";
import { Programme } from "../../../models/curriculum/programme.ts";
import { registerBillings } from "../../../utils/billingFunctions.ts";

const validatePathway = (pathwayDataParam: any) => {
  const { description, startDate, endDate, ...copyLocalData } = pathwayDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllPathways = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "View Pathways");

  if (absoluteAdmin || hasAccess) {
    const pathways = await fetchAllPathways(organisation!._id.toString());

    if (!pathways) {
      throwError("Error fetching pathways", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + pathways.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([pathways, organisation, role, account])
      }
    ]);
    res.status(201).json(pathways);
    return;
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 },
    { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
  ]);
  throwError("Unauthorised Action: You do not have access to view pathways - Please contact your admin", 403);
});

export const getPathways = asyncHandler(async (req: Request, res: Response) => {
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
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, tabAccess, "View Pathways");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchPathways(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.pathways) {
      throwError("Error fetching pathways", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.pathways.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 },
    { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
  ]);
  throwError("Unauthorised Action: You do not have access to view pathway - Please contact your admin", 403);
});

// controller to handle role creation
export const createPathway = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { customId, pathway, programmeId } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Pathway");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create pathway - Please contact your admin", 403);
  }

  const pathwayExists = await Pathway.findOne({ organisationId: orgParsedId, customId });
  if (pathwayExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([pathwayExists, organisation, role, account]) }
    ]);
    throwError(
      "A pathway with this Custom Id already exist - Either refer to that record or change the pathway custom Id",
      409
    );
  }

  const programmeExists = await Programme.findOne({ organisationId: orgParsedId, customId });
  if (!programmeExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, programmeExists, pathwayExists])
      }
    ]);
    throwError(
      "No programme with the provided Custom Id exist - Please create the programme or change the programme custom Id",
      409
    );
  }

  const newPathway = await Pathway.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([customId, pathway, programmeId])
  });

  if (!newPathway) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, programmeExists, pathwayExists, newPathway])
      }
    ]);
    throwError("Error creating pathway - Please try again", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Pathway Creation",
      "Pathway",
      newPathway?._id,
      pathway,
      [
        {
          kind: "N",
          rhs: {
            _id: newPathway._id,
            pathwayId: newPathway.customId,
            pathway
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newPathway) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newPathway, programmeExists, pathwayExists, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updatePathway = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { pathway, customId, programmeId } = body;

  if (!validatePathway(body)) {
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
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Pathway");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit pathway - Please contact your admin", 403);
  }

  const programmeExists = await Programme.findOne({ organisationId: orgParsedId, customId });
  if (!programmeExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, programmeExists])
      }
    ]);
    throwError(
      "No programme with the provided Custom Id exist - Please create the programme or change the programme custom Id",
      409
    );
  }

  const originalPathway = await Pathway.findOne({ organisationId: orgParsedId, customId });

  if (!originalPathway) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, originalPathway, programmeExists])
      }
    ]);
    throwError("An error occured whilst getting old pathway data, Ensure it has not been deleted", 500);
  }

  const updatedPathway = await Pathway.findByIdAndUpdate(
    originalPathway?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([customId, pathway, programmeId])
    },
    { new: true }
  );

  if (!updatedPathway) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, originalPathway, updatedPathway, programmeExists])
      }
    ]);
    throwError("Error updating pathway", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalPathway, updatedPathway);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Pathway Update",
      "Pathway",
      updatedPathway?._id,
      pathway,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedPathway, programmeExists, organisation, role, account, originalPathway]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deletePathway = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { _id } = req.body;
  if (!_id) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Pathway ");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete pathway - Please contact your admin", 403);
  }

  const deletedPathway = await Pathway.findByIdAndDelete(_id);
  if (!deletedPathway) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account])
      }
    ]);
    throwError("Error deleting pathway - Please try again", 500);
  }

  const emitRoom = deletedPathway?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "pathways", deletedPathway, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Pathway Delete",
      "Pathway",
      deletedPathway?._id,
      deletedPathway?.pathway,
      [
        {
          kind: "D" as any,
          lhs: deletedPathway
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
      value: toNegative(getObjectSize(deletedPathway) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedPathway, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
