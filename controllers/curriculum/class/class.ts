import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchClasses,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllClasses
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";

import { Class } from "../../../models/curriculum/class.ts";
import { Pathway } from "../../../models/curriculum/pathway.ts";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";
import { Programme } from "../../../models/curriculum/programme.ts";

const validateClass = (classDataParam: any) => {
  const { description, pathwayId, ...copyLocalData } = classDataParam;
  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllClasses = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, tabAccess, "View Classes");

  if (absoluteAdmin || hasAccess) {
    const classs = await fetchAllClasses(organisation!._id.toString());

    if (!classs) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError("Error fetching classs", 500);
    }
    res.status(201).json(classs);
    registerBillings(req, [
      { field: "databaseOperation", value: 3 + classs.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([classs, organisation, role, account])
      }
    ]);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view class - Please contact your admin", 403);
});

export const getClasses = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, tabAccess, "View Classes");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view classes - Please contact your admin", 403);
  }

  const result = await fetchClasses(query, cursorType as string, parsedLimit, organisation!._id.toString());

  if (!result || !result.classs) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching classs", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.classs.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);
  res.status(201).json(result);
});

// controller to handle role creation
export const createClass = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { classCustomId, className, pathwayId, classFullTitle, programmeId } = body;

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Class");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create class - Please contact your admin", 403);
  }

  const classExists = await Class.findOne({ organisationId: orgParsedId, classCustomId }).lean();
  if (classExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([classExists, organisation, role, account]) }
    ]);
    throwError(
      "A class with this Custom Id already exist - Either refer to that record or change the class custom Id",
      409
    );
  }

  const pathwayExists = await Pathway.findOne({ organisationId: orgParsedId, pathwayId }).lean();
  if (!pathwayExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, classExists]) }
    ]);
    throwError(
      "No pathway with the provided Custom Id exist - Please create the pathway or change the pathway custom Id",
      409
    );
  }

  const programmeExists = await Programme.findOne({ organisationId: orgParsedId, programmeId }).lean();
  if (!programmeExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, pathwayExists, classExists]) }
    ]);
    throwError(
      "No programme with the provided Custom Id exist - Please create the programme or change the programme custom Id",
      409
    );
  }

  const newClass = await Class.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([classCustomId, classFullTitle])
  });

  if (!newClass) {
    registerBillings(req, [
      { field: "databaseOperation", value: 8 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([newClass, classExists, pathwayExists, programmeExists, organisation, role, account])
      }
    ]);
    throwError("Error creating class", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Class Creation",
      "Class",
      newClass?._id,
      className,
      [
        {
          kind: "N",
          rhs: newClass
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 8 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newClass) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newClass, classExists, pathwayExists, organisation, role, account, programmeExists]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateClass = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { className, customId, programmeId, classFullTitle } = body;

  if (!validateClass(body)) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Class");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit class - Please contact your admin", 403);
  }

  const originalClass = await Class.findOne({ organisationId: orgParsedId, customId }).lean();

  if (!originalClass) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("An error occured whilst getting old class data, Ensure it has not been deleted", 500);
  }

  const programmeExists = await Pathway.findOne({ organisationId: orgParsedId, programmeId }).lean();
  if (!programmeExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, originalClass]) }
    ]);
    throwError(
      "No programme with the provided Custom Id exist - Please create the programme or change the programme custom Id",
      409
    );
  }

  const updatedClass = await Class.findByIdAndUpdate(
    originalClass?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([customId, classFullTitle])
    },
    { new: true }
  ).lean();

  if (!updatedClass) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, programmeExists, originalClass])
      }
    ]);
    throwError("Error updating class", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalClass, updatedClass);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Class Update",
      "Class",
      updatedClass?._id,
      className,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedClass, programmeExists, organisation, role, account, originalClass]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteClass = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Class");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete class - Please contact your admin", 403);
  }

  const deletedClass = await Class.findByIdAndDelete(_id).lean();
  if (!deletedClass) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting class - Please try again", 500);
  }

  const emitRoom = deletedClass?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "classs", deletedClass, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Class Delete",
      "Class",
      deletedClass?._id,
      deletedClass?.className,
      [
        {
          kind: "D" as any,
          lhs: deletedClass
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
      value: toNegative(getObjectSize(deletedClass) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedClass, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
