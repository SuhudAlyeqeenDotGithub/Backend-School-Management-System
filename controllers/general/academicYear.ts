import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchAcademicYears,
  userIsStaff,
  emitToOrganisation,
  logActivity,
  getObjectSize
} from "../../utils/utilsFunctions.ts";
import { Billing } from "../../models/admin/billingModel.ts";

import { diff } from "deep-diff";
import { AcademicYear } from "../../models/general/academicYear.ts";
import { getBillingDoc, billOrganisation } from "../../utils/billingFunctions.ts";
import { get } from "http";

declare global {
  namespace Express {
    interface Request {
      userToken?: any;
    }
  }
}

export const getAcademicYears = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
  const account = await confirmAccount(accountId);

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  // confirm role
  const role = await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = tabAccess
    .filter(({ tab }: any) => tab === "Academic Year")[0]
    .actions.some(({ name }: any) => name === "View Academic Years");

  if (absoluteAdmin || hasAccess) {
    const academicYears = await fetchAcademicYears(organisation!._id.toString());

    if (!academicYears) {
      throwError("Error fetching academic years", 500);
    }

    // log database read
    await billOrganisation(organisation!._id.toString(), [
      { field: "databaseOperation", value: academicYears.length + 3 }
    ]);

    res.status(201).json(academicYears);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view academic years - Please contact your admin", 403);
});

// controller to handle role creation
export const createAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { academicYear, startDate, endDate } = req.body;

  // validate input
  if (!academicYear || !startDate || !endDate) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const account = await confirmAccount(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const organisation = await confirmAccount(orgParsedId);

  const yearNameExists = await AcademicYear.findOne({ academicYear, organisationId: orgParsedId });
  if (yearNameExists) {
    throwError("This academic year name is already in use in this organisation - Please use a different name", 409);
  }

  const role = await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus, accountName, staffId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab }: any) => tab === "Academic Year")[0]
    .actions.some(({ name, permission }: any) => name === "Create Academic Year" && permission === true);

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create academic year - Please contact your admin", 403);
  }

  const newAcademicYear = await AcademicYear.create({
    academicYear,
    startDate,
    endDate,
    organisationId: orgParsedId,
    searchText: generateSearchText([academicYear, startDate, endDate])
  });

  const activityLog = await logActivity(
    account?.organisationId,
    accountId,
    "Academic Year Creation",
    "AcademicYear",
    newAcademicYear?._id,
    newAcademicYear?.academicYear,
    [
      {
        kind: "N",
        rhs: {
          _id: newAcademicYear?._id,
          academicYear: newAcademicYear?.academicYear,
          startDate: newAcademicYear?.startDate,
          endDate: newAcademicYear?.endDate,
          searchText: newAcademicYear?.searchText
        }
      }
    ],
    new Date()
  );
  // log database read
  const objectSize = getObjectSize(newAcademicYear) + getObjectSize(activityLog);
  await billOrganisation(organisation!._id.toString(), [
    { field: "databaseOperation", value: 6 },
    { field: "databaseStorageAndBackup", value: objectSize * 2 }
  ]);
  res.status(201).json("successfull");
});

// controller to handle role update
export const updateAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { _id: academicYearId, academicYear, startDate, endDate } = req.body;

  // validate input
  if (!academicYear || !startDate || !endDate) {
    throwError("Please fill in all required fields", 400);
  }
  // confirm user
  const account = await confirmAccount(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const organisation = await confirmAccount(orgParsedId);
  const role = await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasAccess = creatorTabAccess
    .filter(({ tab }: any) => tab === "Academic Year")[0]
    .actions.some(({ name, permission }: any) => name === "Edit Academic Year" && permission === true);

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit academic year - Please contact your admin", 403);
  }

  const originalAcademicYear = await AcademicYear.findById(academicYearId);

  if (!originalAcademicYear) {
    throwError("An error occured whilst getting old Academic Year data", 500);
  }

  const updatedAcademicYear = await AcademicYear.findByIdAndUpdate(
    academicYearId,
    {
      ...req.body,
      searchText: generateSearchText([academicYear, startDate, endDate])
    },
    { new: true }
  );

  if (!updatedAcademicYear) {
    throwError("Error updating academic year", 500);
  }

  const difference = diff(originalAcademicYear, updatedAcademicYear);

  const activityLog = await logActivity(
    account?.organisationId,
    accountId,
    "Academic Year Update",
    "AcademicYear",
    updatedAcademicYear?._id,
    academicYear,
    difference,
    new Date()
  );
  await billOrganisation(organisation!._id.toString(), [{ field: "databaseOperation", value: 6 }]);
  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { academicYearIdToDelete } = req.body;
  if (!academicYearIdToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }
  // confirm user
  const account = await confirmAccount(accountId);
  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());
  const role = await confirmRole(account!.roleId!._id.toString());
  const { roleId: creatorRoleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;
  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }
  const hasAccess = creatorTabAccess
    .filter(({ tab, actions }: any) => tab === "Staff")[0]
    .actions.some(({ name, permission }: any) => name === "Delete Sta" && permission === true);
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete academic year - Please contact your admin", 403);
  }

  const academicYearToDelete = await AcademicYear.findById(academicYearIdToDelete);

  if (!academicYearToDelete) {
    throwError("Error finding academic year - It could have been deleted, Please try again", 404);
  }

  const deletedAcademicYear = await AcademicYear.findByIdAndDelete(academicYearIdToDelete);
  if (!deletedAcademicYear) {
    throwError("Error deleting academic year - Please try again", 500);
  }

  const emitRoom = deletedAcademicYear?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "academicyears");

  await logActivity(
    account?.organisationId,
    accountId,
    "Academic Year Deletion",
    "AcademicYear",
    deletedAcademicYear?._id,
    academicYearToDelete?.academicYear,
    [
      {
        kind: "D" as any,
        lhs: academicYearToDelete
      }
    ],
    new Date()
  );

  await billOrganisation(organisation!._id.toString(), [{ field: "databaseOperation", value: 6 }]);

  res.status(201).json("successfull");
});
