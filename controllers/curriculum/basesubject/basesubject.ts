import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchBaseSubjects,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllBaseSubjects
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";

import { BaseSubject } from "../../../models/curriculum/basesubject";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";

const validateBaseSubject = (baseSubjectDataParam: any) => {
  const { description, ...copyLocalData } = baseSubjectDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllBaseSubjects = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, tabAccess, "View Base Subjects");

  if (absoluteAdmin || hasAccess) {
    const baseSubjects = await fetchAllBaseSubjects(organisation!._id.toString());

    if (!baseSubjects) {
      throwError("Error fetching base subject profiles", 500);
    }
    registerBillings(req, [
      { field: "databaseOperation", value: 3 + baseSubjects.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([baseSubjects, organisation, role, account])
      }
    ]);
    res.status(201).json(baseSubjects);
    return;
  }

  throwError(
    "Unauthorised Action: You do not have access to view base subject profile - Please contact your admin",
    403
  );
});

export const getBaseSubjects = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, tabAccess, "View Base Subjects");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchBaseSubjects(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.baseSubjects) {
      throwError("Error fetching base subjects", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.baseSubjects.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError(
    "Unauthorised Action: You do not have access to view base subject profile - Please contact your admin",
    403
  );
});

// controller to handle role creation
export const createBaseSubject = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { baseSubjectCustomId, baseSubjectName } = body;

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Base Subject");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create base subject - Please contact your admin", 403);
  }

  const baseSubjectExists = await BaseSubject.findOne({ organisationId: orgParsedId, baseSubjectCustomId });
  if (baseSubjectExists) {
    throwError(
      "A baseSubject with this Custom Id already exist - Either refer to that record or change the baseSubject custom Id",
      409
    );
  }

  const newBaseSubject = await BaseSubject.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([baseSubjectCustomId, baseSubjectName])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "BaseSubject Creation",
      "BaseSubject",
      newBaseSubject?._id,
      baseSubjectName,
      [
        {
          kind: "N",
          rhs: {
            _id: newBaseSubject._id,
            baseSubjectId: newBaseSubject.baseSubjectCustomId,
            baseSubjectName
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newBaseSubject) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newBaseSubject, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateBaseSubject = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { baseSubjectCustomId, baseSubjectName } = body;

  if (!validateBaseSubject(body)) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Base Subject");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit base subject - Please contact your admin", 403);
  }

  const originalBaseSubject = await BaseSubject.findOne({ organisationId: orgParsedId, baseSubjectCustomId });

  if (!originalBaseSubject) {
    throwError("An error occured whilst getting old base subject data, Ensure it has not been deleted", 500);
  }

  const updatedBaseSubject = await BaseSubject.findByIdAndUpdate(
    originalBaseSubject?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([baseSubjectCustomId, baseSubjectName])
    },
    { new: true }
  );

  if (!updatedBaseSubject) {
    throwError("Error updating base subject", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalBaseSubject, updatedBaseSubject);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Base Subject Update",
      "BaseSubject",
      updatedBaseSubject?._id,
      baseSubjectName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedBaseSubject, organisation, role, account, originalBaseSubject]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteBaseSubject = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { baseSubjectCustomId } = req.body;
  if (!baseSubjectCustomId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Base Subject");
  if (!absoluteAdmin && !hasAccess) {
    throwError(
      "Unauthorised Action: You do not have access to delete base subject profile - Please contact your admin",
      403
    );
  }

  const baseSubjectToDelete = await BaseSubject.findOne({
    organisationId: organisation?._id.toString(),
    baseSubjectCustomId: baseSubjectCustomId
  });

  if (!baseSubjectToDelete) {
    throwError("Error finding base subject with provided Custom Id - Please try again", 404);
  }

  const deletedBaseSubject = await BaseSubject.findByIdAndDelete(baseSubjectToDelete?._id.toString());
  if (!deletedBaseSubject) {
    throwError("Error deleting base subject - Please try again", 500);
  }

  const emitRoom = deletedBaseSubject?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "basesubjects", deletedBaseSubject, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "BasesSubject Delete",
      "BaseSubject",
      deletedBaseSubject?._id,
      deletedBaseSubject?.baseSubjectName,
      [
        {
          kind: "D" as any,
          lhs: deletedBaseSubject
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
      value: toNegative(getObjectSize(deletedBaseSubject) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedBaseSubject, organisation, role, account, baseSubjectToDelete]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
