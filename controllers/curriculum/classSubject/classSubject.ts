import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchClassSubjects,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllClassSubjects
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { ClassSubject } from "../../../models/curriculum/classSubject.ts";
import { Class } from "../../../models/curriculum/class.ts";
import { BaseSubject } from "../../../models/curriculum/basesubject";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";
import { Programme } from "../../../models/curriculum/programme.ts";

const validateSubject = (classSubjectDataParam: any) => {
  const { description, startDate, endeDate, pathwayId, ...copyLocalData } = classSubjectDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllClassSubjects = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, tabAccess, "View Subjects");
  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view class subjects - Please contact your admin", 403);
  }
  const classSubjects = await fetchAllClassSubjects(organisation!._id.toString());

  if (!classSubjects) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching class subject", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + classSubjects.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([classSubjects, organisation, role, account])
    }
  ]);
  res.status(201).json(classSubjects);
});

export const getClassSubjects = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, tabAccess, "View Subjects");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view class subjects - Please contact your admin", 403);
  }
  const result = await fetchClassSubjects(query, cursorType as string, parsedLimit, organisation!._id.toString());

  if (!result || !result.classSubjects) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching classSubjects", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.classSubjects.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);
  res.status(201).json(result);
});

// controller to handle role creation
export const createClassSubject = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { customId, programmeId, classId, baseSubjectId, classSubject } = body;

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Subject");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create classSubject - Please contact your admin", 403);
  }

  const classSubjectExists = await ClassSubject.findOne({ organisationId: orgParsedId, customId }).lean();
  if (classSubjectExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([classSubjectExists, organisation, role, account]) }
    ]);
    throwError(
      "A class subject with this Custom Id already exist - Either refer to that record or change the classSubject custom Id",
      409
    );
  }

  const programmeExists = await Programme.findById(programmeId).lean();
  if (!programmeExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, classSubjectExists]) }
    ]);
    throwError(
      "No programme with the provided Custom Id exist - Please create the programme or change the programme custom Id",
      409
    );
  }

  const classExists = await Class.findById(classId).lean();
  if (!classExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, programmeExists, classSubjectExists])
      }
    ]);
    throwError(
      "No class with the provided Custom Id exist - Please create the class or change the class custom Id",
      409
    );
  }

  const baseSubjectExists = await BaseSubject.findById(baseSubjectId).lean();
  if (!baseSubjectExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, programmeExists, classExists, classSubjectExists])
      }
    ]);
    throwError(
      "No base subject with the provided Custom Id exist - Please create the base class subject or change the base classSubject custom Id",
      409
    );
  }

  const newSubject = await ClassSubject.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([customId, baseSubjectId, programmeId, classId])
  });

  if (!newSubject) {
    registerBillings(req, [
      { field: "databaseOperation", value: 9 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          organisation,
          role,
          account,
          programmeExists,
          classExists,
          baseSubjectExists,
          classSubjectExists
        ])
      }
    ]);
    throwError("Error creating class subject - Please try again", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Class Subject Creation",
      "ClassSubject",
      newSubject?._id,
      classSubject,
      [
        {
          kind: "N",
          rhs: newSubject
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 9 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newSubject) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newSubject, baseSubjectExists, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateClassSubject = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { customId, programmeId, classId, baseSubjectId, classSubject } = body;

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
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Subject");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit classSubject - Please contact your admin", 403);
  }

  const originalSubject = await ClassSubject.findOne({ organisationId: orgParsedId, customId }).lean();
  if (originalSubject) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([originalSubject, organisation, role, account]) }
    ]);
    throwError("An error occured whilst getting old classSubject data, Ensure it has not been deleted", 500);
  }

  const programmeExists = await Programme.findById(programmeId).lean();
  if (!programmeExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, originalSubject]) }
    ]);
    throwError(
      "No programme with the provided Custom Id exist - Please create the programme or change the programme custom Id",
      409
    );
  }

  const classExists = await Class.findById(classId).lean();
  if (!classExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, programmeExists, originalSubject])
      }
    ]);
    throwError(
      "No class with the provided Custom Id exist - Please create the class or change the class custom Id",
      409
    );
  }

  const baseSubjectExists = await BaseSubject.findById(baseSubjectId).lean();
  if (!baseSubjectExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, programmeExists, classExists, originalSubject])
      }
    ]);
    throwError(
      "No base subject with the provided Custom Id exist - Please create the base class subject or change the base classSubject custom Id",
      409
    );
  }

  const updatedSubject = await ClassSubject.findByIdAndUpdate(
    originalSubject?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([customId, baseSubjectId, programmeId, classId])
    },
    { new: true }
  );

  if (!updatedSubject) {
    registerBillings(req, [
      { field: "databaseOperation", value: 9 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          organisation,
          role,
          account,
          programmeExists,
          classExists,
          baseSubjectExists,
          originalSubject
        ])
      }
    ]);

    throwError("Error updating classSubject", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalSubject, updatedSubject);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Subject Update",
      "Subject",
      updatedSubject?._id,
      classSubject,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 9 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([
          updatedSubject,
          programmeExists,
          classExists,
          baseSubjectExists,
          organisation,
          role,
          account,
          originalSubject
        ]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteClassSubject = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Subject");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete class subject - Please contact your admin", 403);
  }

  const deletedSubject = await ClassSubject.findByIdAndDelete(_id).lean();
  if (!deletedSubject) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting class subject - Please try again", 500);
  }

  const emitRoom = deletedSubject?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "classsubjects", deletedSubject, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Subject Delete",
      "Subject",
      deletedSubject?._id,
      deletedSubject?.classSubject,
      [
        {
          kind: "D" as any,
          lhs: deletedSubject
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
      value: toNegative(getObjectSize(deletedSubject) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedSubject, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
