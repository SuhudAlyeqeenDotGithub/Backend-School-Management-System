import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchClassTutors,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllClassTutors,
  checkAccesses
} from "../../../utils/databaseFunctions.ts";
import { logActivity } from "../../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { throwError, toNegative, generateSearchText, getObjectSize } from "../../../utils/pureFuctions.ts";
import { StaffContract } from "../../../models/staff/contracts.ts";
import { ClassTutor } from "../../../models/curriculum/class.ts";
import { registerBillings } from "../../../utils/billingFunctions.ts";
import { getNeededAccesses } from "../../../utils/defaultVariables.ts";

const validateClassTutor = (classTutorDataParam: any) => {
  const { managedUntil, classCustomId, ...copyLocalData } = classTutorDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllClassTutors = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasAccess = checkAccesses(account, tabAccess, getNeededAccesses("All Class Tutors"));

  if (absoluteAdmin || hasAccess) {
    const result = await fetchAllClassTutors(organisation!._id.toString(), staffId);

    if (!result) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError("Error fetching class tutors", 500);
    }
    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view class tutors - Please contact your admin", 403);
});

export const getClassTutors = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, staffId } = account as any;
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
    checkAccess(account, tabAccess, "View Class Tutors") &&
    checkAccess(account, tabAccess, "View Classes") &&
    checkAccess(account, tabAccess, "View Programmes") &&
    checkAccess(account, tabAccess, "View Pathways") &&
    checkAccess(account, tabAccess, "View Staff Profiles");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view class tutors - Please contact your admin", 403);
  }

  const result = await fetchClassTutors(
    query,
    cursorType as string,
    parsedLimit,
    absoluteAdmin ? "Absolute Admin" : "User",
    organisation!._id.toString(),
    staffId
  );

  if (!result || !result.classTutors) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching class tutors", 500);
  }
  registerBillings(req, [
    { field: "databaseOperation", value: 3 + result.classTutors.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([result, organisation, role, account])
    }
  ]);
  res.status(201).json(result);
});

// controller to handle role creation
export const createClassTutor = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;

  const { classCustomId, status, classId, classFullTitle, staffId, tutorFullName } = body;

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Class Tutor");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create class tutor - Please contact your admin", 403);
  }

  const staffHasContract = await StaffContract.findOne({
    staffId
  });
  if (!staffHasContract) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("The staff has no contract with this organisation - Please create one for them", 409);
  }
  let classAlreadyManaged;
  if (status === "Active") {
    classAlreadyManaged = await ClassTutor.findOne({
      organisationId: orgParsedId,
      classId,
      staffId,
      status: "Active"
    }).lean();
    if (classAlreadyManaged) {
      registerBillings(req, [
        { field: "databaseOperation", value: 5 },
        {
          field: "databaseDataTransfer",
          value: getObjectSize([organisation, role, account, classAlreadyManaged, staffHasContract])
        }
      ]);
      throwError(
        "The staff is already an active tutor of this class - Please assign another staff or deactivate their current management, or set this current one to inactive",
        409
      );
    }
  }

  const newClassTutor = await ClassTutor.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([classCustomId, classFullTitle, staffId, tutorFullName])
  });

  if (!newClassTutor) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, staffHasContract]) }
    ]);
    throwError("Error creating class tutor", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Class Tutor Creation",
      "ClassTutor",
      newClassTutor?._id,
      tutorFullName,
      [
        {
          kind: "N",
          rhs: newClassTutor
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 6 + (logActivityAllowed ? 2 : 0) + (status === "Active" ? 1 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: getObjectSize(newClassTutor) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newClassTutor, staffHasContract, organisation, role, account]) +
        (status === "Active" ? getObjectSize(classAlreadyManaged) : 0)
    }
  ]);
  res.status(201).json("successfull");
});

// controller to handle role update
export const updateClassTutor = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { classCustomId, classFullTitle, staffId, tutorFullName } = body;

  if (!validateClassTutor(body)) {
    throwError("Please fill in all required fields", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Class Tutor");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit class tutor - Please contact your admin", 403);
  }

  const originalClassTutor = await ClassTutor.findOne({ _id: body._id }).lean();

  if (!originalClassTutor) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("An error occured whilst getting old class tutor data, Ensure it has not been deleted", 500);
  }

  const updatedClassTutor = await ClassTutor.findByIdAndUpdate(
    originalClassTutor?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([classCustomId, classFullTitle, staffId, tutorFullName])
    },
    { new: true }
  ).lean();

  if (!updatedClassTutor) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, originalClassTutor]) }
    ]);
    throwError("Error updating class", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalClassTutor, updatedClassTutor);
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Class Tutor Update",
      "ClassTutor",
      updatedClassTutor?._id,
      classFullTitle,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([updatedClassTutor, organisation, role, account, originalClassTutor])
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteClassTutor = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Class Tutor");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete class tutor - Please contact your admin", 403);
  }

  const deletedClassTutor = await ClassTutor.findByIdAndDelete(_id).lean();
  if (!deletedClassTutor) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting class Tutor - Please try again", 500);
  }

  const emitRoom = deletedClassTutor?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "classtutors", deletedClassTutor, "delete");

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Class Tutor Deletion",
      "ClassTutor",
      deletedClassTutor?._id,
      deletedClassTutor?.tutorFullName,
      [
        {
          kind: "D" as any,
          lhs: deletedClassTutor
        }
      ],
      new Date()
    );

    registerBillings(req, [
      {
        field: "databaseOperation",
        value: 5 + (logActivityAllowed ? 2 : 0)
      },
      {
        field: "databaseStorageAndBackup",
        value: toNegative(getObjectSize(deletedClassTutor) * 2)
      },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([deletedClassTutor, organisation, role, account])
      }
    ]);
  }
  res.status(201).json("successfull");
});
