import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchSyllabuses,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllSyllabuses
} from "../../../utils/databaseFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { Syllabus } from "../../../models/curriculum/syllabus";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { Programme } from "../../../models/curriculum/programme.ts";
import { BaseSubject } from "../../../models/curriculum/basesubject.ts";
import { Pathway } from "../../../models/curriculum/pathway.ts";

const validateSyllabus = (syllabusDataParam: any) => {
  const { description, startDate, endDate, topics, learningOutcomes, notes, ...copyLocalData } = syllabusDataParam;

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
  const hasAccess = checkAccess(account, tabAccess, "View Syllabuses");

  if (absoluteAdmin || hasAccess) {
    const syllabusProfiles = await fetchAllSyllabuses(organisation!._id.toString());

    if (!syllabusProfiles) {
      throwError("Error fetching syllabus", 500);
    }
    registerBillings(req, [
      { field: "databaseOperation", value: 3 + syllabusProfiles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([syllabusProfiles, organisation, role, account])
      }
    ]);
    res.status(201).json(syllabusProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view syllabus- Please contact your admin", 403);
});

export const getSyllabuses = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, tabAccess, "View Syllabuses");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchSyllabuses(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.syllabuses) {
      throwError("Error fetching syllabuses", 500);
    }
    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.syllabuses.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view syllabus- Please contact your admin", 403);
});

// controller to handle role creation
export const createSyllabus = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { customId, syllabus, programmeId, baseSubjectId, pathwayId } = body;

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Syllabus");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create syllabus - Please contact your admin", 403);
  }

  const syllabusExists = await Syllabus.findOne({ organisationId: orgParsedId, customId }).lean();

  if (syllabusExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([syllabusExists, organisation, role, account]) }
    ]);
    throwError(
      "A syllabus with this Custom Id already exist within the organisation - Either refer to that record or change the syllabus custom Id",
      409
    );
  }

  let pathwayOrProgramme;
  if (pathwayId !== "") {
    const pathwayProgrammeMatchExists = await Pathway.findOne({ _id: pathwayId, programmeId }).lean();
    pathwayOrProgramme = pathwayProgrammeMatchExists;
    if (!pathwayProgrammeMatchExists) {
      registerBillings(req, [
        { field: "databaseOperation", value: 5 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([organisation, role, account, syllabusExists])
        }
      ]);
      throwError(
        "The selected pathway does not belong to the selected programme - Please change the selected pathway or programme",
        409
      );
    }
  } else {
    const programmeExists = await Programme.findById(programmeId).lean();
    pathwayOrProgramme = programmeExists;
    if (!programmeExists) {
      registerBillings(req, [
        { field: "databaseOperation", value: 5 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, syllabusExists]) }
      ]);
      throwError("This programme does not exist - Please create the programme or change the picked programme", 409);
    }
  }

  const baseSubjectExists = await BaseSubject.findById(baseSubjectId).lean();

  if (!baseSubjectExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, syllabusExists, pathwayOrProgramme])
      }
    ]);
    throwError(
      "This base subject does not exist - Please create the base subject or change the picked base subject",
      409
    );
  }

  const newSyllabus = await Syllabus.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([syllabus, customId])
  });

  if (!newSyllabus) {
    registerBillings(req, [
      { field: "databaseOperation", value: 8 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, syllabusExists, pathwayOrProgramme, baseSubjectExists])
      }
    ]);
    throwError("Error creating syllabus - Please try again", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Syllabus Creation",
      "Syllabus",
      newSyllabus?._id,
      syllabus,
      [
        {
          kind: "N",
          rhs: newSyllabus
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 8 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: (getObjectSize(newSyllabus) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newSyllabus, syllabusExists, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateSyllabus = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { customId, syllabus, programmeId, baseSubjectId, pathwayId } = body;

  if (!validateSyllabus(body)) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Syllabus");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit syllabus - Please contact your admin", 403);
  }

  const originalSyllabus = await Syllabus.findOne({ organisationId: orgParsedId, customId }).lean();

  if (!originalSyllabus) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("An error occured whilst getting old syllabus data, Ensure it has not been deleted", 500);
  }

  let pathwayOrProgramme;
  if (pathwayId !== "") {
    const pathwayProgrammeMatchExists = await Pathway.findOne({ _id: pathwayId, programmeId }).lean();
    pathwayOrProgramme = pathwayProgrammeMatchExists;
    if (!pathwayProgrammeMatchExists) {
      registerBillings(req, [
        { field: "databaseOperation", value: 5 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([organisation, role, account, originalSyllabus])
        }
      ]);
      throwError(
        "The selected pathway does not belong to the selected programme - Please change the selected pathway or programme",
        409
      );
    }
  } else {
    const programmeExists = await Programme.findById(programmeId).lean();
    pathwayOrProgramme = programmeExists;
    if (!programmeExists) {
      registerBillings(req, [
        { field: "databaseOperation", value: 5 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, originalSyllabus]) }
      ]);
      throwError("This programme does not exist - Please create the programme or change the picked programme", 409);
    }
  }

  const updatedSyllabus = await Syllabus.findByIdAndUpdate(
    originalSyllabus?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([syllabus, customId])
    },
    { new: true }
  ).lean();

  if (!updatedSyllabus) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, originalSyllabus, pathwayOrProgramme])
      }
    ]);
    throwError("Error updating syllabus", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalSyllabus, updatedSyllabus);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Syllabus Update",
      "Syllabus",
      updatedSyllabus?._id,
      syllabus,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedSyllabus, organisation, role, account, originalSyllabus]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteSyllabus = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Syllabus");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete syllabus - Please contact your admin", 403);
  }

  const deletedSyllabus = await Syllabus.findByIdAndDelete(_id).lean();

  if (!deletedSyllabus) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting syllabus - Please try again", 500);
  }

  const emitRoom = deletedSyllabus?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "syllabuses", deletedSyllabus, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
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
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 5 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: toNegative(getObjectSize(deletedSyllabus) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedSyllabus, organisation, role, account]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
