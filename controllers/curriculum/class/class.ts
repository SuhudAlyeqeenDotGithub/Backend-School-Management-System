import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchClasses,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllClasses,
  generateCustomId,
  checkAccesses
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";

import { Class } from "../../../models/curriculum/class.ts";
import { Pathway } from "../../../models/curriculum/pathway.ts";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";
import { Programme } from "../../../models/curriculum/programme.ts";
import { ClassSubject } from "../../../models/curriculum/classSubject.ts";
import { getNeededAccesses } from "../../../utils/defaultVariables.ts";

const validateClass = (classDataParam: any) => {
  const {
    description,
    duration,
    pathwayCustomId,
    pathwayId,
    pathway,
    subjects,
    qualification,
    awardingBody,
    autoCreateClassSubjects,
    classFullTitle,
    ...copyLocalData
  } = classDataParam;

  if (classDataParam.subjects.length < 1) {
    throwError("Please add at least one subject to the class", 400);
  }

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
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccesses(account, tabAccess, getNeededAccesses("All Classes"));

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to view classes or one of it's required data (programmes, base subjects)  - Please contact your admin",
      403
    );
  }
  const classes = await fetchAllClasses(organisation!._id.toString());

  if (!classes) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching classes", 500);
  }
  res.status(201).json(classes);
  registerBillings(req, [
    { field: "databaseOperation", value: 3 + classes.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([classes, organisation, role, account])
    }
  ]);
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
  const hasAccess =
    checkAccess(account, tabAccess, "View Classes") &&
    checkAccess(account, tabAccess, "View Programmes") &&
    checkAccess(account, tabAccess, "View Pathways") &&
    checkAccess(account, tabAccess, "View Base Subjects");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to view classes or one of it's required data (programmes, base subjects)  - Please contact your admin",
      403
    );
  }

  const result = await fetchClasses(query, cursorType as string, parsedLimit, organisation!._id.toString());

  if (!result || !result.classes) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching classes", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.classes.length },
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

  const {
    customId,
    className,
    pathwayId,
    classFullTitle,
    programmeId,
    autoCreateClassSubjects,
    subjects,
    subjectObjects,
    status
  } = body;

  if (subjectObjects.length < 1 && autoCreateClassSubjects) {
    throwError("We could not find any base subjects, please ensure you add at least one subject", 400);
  }
  if (!validateClass(body)) {
    throwError("Please fill in all required fields", 400);
  }

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Class");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create class - Please contact your admin", 403);
  }

  const classExists = await Class.findOne({ organisationId: orgParsedId, customId }).lean();
  if (classExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([classExists, organisation, role, account]) }
    ]);
    throwError(
      "A class with this Custom Id already exist within the organisation - Either refer to that record or change the class custom Id",
      409
    );
  }

  const alreadyOfferingClass = await Class.findOne({
    organisationId: orgParsedId,
    className,
    programmeId,
    pathwayId: pathwayId ? pathwayId : null
  }).lean();

  if (alreadyOfferingClass) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([classExists, organisation, role, account]) }
    ]);
    throwError(
      "A class with this name, programme, pathway (if applicable) already exist within the organisation - Either refer to that record, change the class name or change the status",
      409
    );
  }

  let pathwayExists;
  if (pathwayId) {
    pathwayExists = await Pathway.findById(pathwayId).lean();
    if (!pathwayExists) {
      registerBillings(req, [
        { field: "databaseOperation", value: 6 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([organisation, role, account, classExists, alreadyOfferingClass])
        }
      ]);
      throwError(
        "This pathway does not exist - Please create the pathway or select the pathway that the class belongs to",
        409
      );
    }

    if (pathwayExists?.programmeId.toString() !== programmeId) {
      registerBillings(req, [
        { field: "databaseOperation", value: 6 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([organisation, role, account, classExists, pathwayExists, alreadyOfferingClass])
        }
      ]);
      throwError(
        "The selected pathway does not belong to the selected programme - Please change the selected pathway or programme",
        409
      );
    }
  }

  const programmeExists = await Programme.findById(programmeId).lean();
  if (!programmeExists) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, pathwayExists, classExists, alreadyOfferingClass])
      }
    ]);
    throwError(
      "This programme does not exist - Please create the programme or select the programme that the class belongs to",
      409
    );
  }

  const newClass = await Class.create({
    ...body,
    pathwayId: pathwayId ? pathwayId : null,
    organisationId: orgParsedId,
    searchText: generateSearchText([customId, classFullTitle])
  });

  if (!newClass) {
    registerBillings(req, [
      { field: "databaseOperation", value: 9 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          newClass,
          classExists,
          pathwayExists,
          programmeExists,
          organisation,
          role,
          account,
          alreadyOfferingClass
        ])
      }
    ]);
    throwError("Error creating class", 500);
  }

  let activityLog1;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog1 = await logActivity(
      req,
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

  let mappedSubjects: any = [];
  let createdSubjects: any = [];

  if (autoCreateClassSubjects) {
    mappedSubjects = subjects.map((baseSubjectId: string) => {
      const newCustomId = generateCustomId(`CLSBJ`, true, "numeric");
      const subjectObject = subjectObjects.find((s: any) => s._id === baseSubjectId);
      return {
        organisationId: orgParsedId,
        customId: newCustomId,
        classSubject: subjectObject.baseSubject,
        baseSubjectId,
        programmeId: programmeId,
        pathwayId: pathwayId ? pathwayId : null,
        classId: newClass._id,
        description: "",
        startDate: "",
        endDate: "",
        status: "Offering",
        searchText: generateSearchText([
          [newCustomId, baseSubjectId, programmeId, newClass._id, subjectObject.baseSubject]
        ])
      };
    });

    const bulkCreate = mappedSubjects.map((doc: any) => ({
      insertOne: {
        document: doc
      }
    }));

    createdSubjects = await ClassSubject.bulkWrite(bulkCreate, { ordered: true });
    if (!createdSubjects) {
      registerBillings(req, [
        { field: "databaseOperation", value: 9 + (logActivityAllowed ? 2 : 0) },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([
            newClass,
            classExists,
            pathwayExists,
            programmeExists,
            organisation,
            role,
            account,
            alreadyOfferingClass,
            activityLog1
          ])
        }
      ]);
      throwError(
        "Error creating class subjects - however the class was successfully created, you will need to create the subject mananually in class subject tab",
        500
      );
    }
  }

  if (logActivityAllowed) {
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Class Subject Bulk Creation",
      "ClassSubject",
      newClass?._id,
      className,
      [
        {
          kind: "N",
          rhs: { classSubjects: mappedSubjects }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value:
        9 +
        (logActivityAllowed ? 2 : 0) +
        (autoCreateClassSubjects ? mappedSubjects.length * 2 : 0) +
        (logActivityAllowed && autoCreateClassSubjects ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: getObjectSize(newClass) * 2 + (autoCreateClassSubjects ? getObjectSize(createdSubjects) : 0)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([
        newClass,
        classExists,
        pathwayExists,
        organisation,
        role,
        account,
        programmeExists,
        createdSubjects,
        alreadyOfferingClass
      ])
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateClass = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { _id: classId, className, customId, programmeId, classFullTitle, pathwayId, status } = body;

  if (!classId) {
    throwError("We could not get the class id - please close dialog and try again", 400);
  }

  if (!validateClass(body)) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Class");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit class - Please contact your admin", 403);
  }

  const alreadyOfferingClass = await Class.findById(classId).lean();

  const updatedClass = await Class.findByIdAndUpdate(
    classId,
    {
      ...body,
      pathwayId: pathwayId ? pathwayId : null,
      searchText: generateSearchText([customId, classFullTitle])
    },
    { new: true }
  ).lean();

  if (!updatedClass) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account, alreadyOfferingClass])
      }
    ]);
    throwError("Error updating class", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(alreadyOfferingClass, updatedClass);
    await logActivity(
      req,
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
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([updatedClass, organisation, role, account, alreadyOfferingClass])
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

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId ?? { absoluteAdmin: false, tabAccess: [] };

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
  emitToOrganisation(emitRoom, "classes", deletedClass, "delete");

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
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
      value: toNegative(getObjectSize(deletedClass) * 2)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([deletedClass, organisation, role, account])
    }
  ]);
  res.status(201).json("successfull");
});
