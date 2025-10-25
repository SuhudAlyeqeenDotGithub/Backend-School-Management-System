import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import {
  confirmAccount,
  confirmRole,
  throwError,
  generateSearchText,
  fetchAcademicYears,
  emitToOrganisation,
  logActivity,
  getObjectSize,
  toNegative,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess
} from "../../utils/utilsFunctions.ts";

import { diff } from "deep-diff";
import { AcademicYear } from "../../models/timeline/academicYear.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { Period } from "../../models/timeline/period.ts";
export const getAcademicYears = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, accountStatus, staffId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Academic Years");

  if (absoluteAdmin || hasAccess) {
    const academicYears = await fetchAcademicYears(organisation!._id.toString());

    if (!academicYears) {
      throwError("Error fetching academic years", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: academicYears.length + 3 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([academicYears, organisation, role, account])
      }
    ]);

    res.status(201).json(academicYears);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view academic years - Please contact your admin", 403);
});

// controller to handle role creation
export const createAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { academicYear, startDate, endDate, periods } = req.body;

  // validate input
  if (!academicYear || !startDate || !endDate || !Array.isArray(periods) || periods.length === 0) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const yearNameExists = await AcademicYear.findOne({ organisationId: orgParsedId, academicYear });
  if (yearNameExists) {
    throwError("This academic year name is already in use in this organisation - Please use a different name", 409);
  }

  const { roleId, accountStatus, accountName, staffId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(
    account,

    creatorTabAccess,

    "Edit Academic Year"
  );

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create academic year - Please contact your admin", 403);
  }

  const newAcademicYear = await AcademicYear.create({
    academicYear,
    startDate,
    endDate,
    organisationId: orgParsedId
  });

  if (!newAcademicYear) {
    throwError("Error creating academic year", 500);
  }

  const academicYearTaggedPeriods = periods.map(
    (period: { period: string; startDate: string; endDate: string; customId: string }) => ({
      organisationId: orgParsedId,
      customId: period.customId,
      academicYearId: newAcademicYear?._id,
      academicYear: newAcademicYear?.academicYear,
      period: period.period,
      startDate: period.startDate,
      endDate: period.endDate
    })
  );

  const createdPeriods = await Period.insertMany(academicYearTaggedPeriods);

  if (!createdPeriods) {
    throwError("Error creating academic year periods", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;
  if (logActivityAllowed) {
    activityLog = await logActivity(
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
            periods: createdPeriods
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 1 : 0) + createdPeriods?.length * 2 },
    { field: "databaseStorageAndBackup", value: getObjectSize([newAcademicYear, activityLog, createdPeriods]) * 2 },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([newAcademicYear, organisation, role, account, yearNameExists, activityLog, createdPeriods])
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { _id: academicYearId, academicYear, startDate, endDate } = req.body;

  // validate input
  if (!academicYear || !startDate || !endDate) {
    throwError("Please fill in all required fields", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Academic Year");

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
      ...req.body
    },
    { new: true }
  );

  if (!updatedAcademicYear) {
    throwError("Error updating academic year", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalAcademicYear, updatedAcademicYear);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Academic Year Update",
      "AcademicYear",
      updatedAcademicYear?._id,
      academicYear,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 1 : 0) },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([updatedAcademicYear, organisation, role, account, originalAcademicYear, activityLog])
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { academicYearIdToDelete } = req.body;
  if (!academicYearIdToDelete) {
    throwError("Unknown delete request - Please try again", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Academic Year");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete academic year - Please contact your admin", 403);
  }

  const academicYearToDelete = await AcademicYear.findById(academicYearIdToDelete);

  if (!academicYearToDelete) {
    throwError("Error finding academic year - It could have been deleted, Please try again", 404);
  }

  const deletedAcademicYearPeriods = await Period.deleteMany({ academicYearId: academicYearIdToDelete });

  const deletedAcademicYear = await AcademicYear.findByIdAndDelete(academicYearIdToDelete);
  if (!deletedAcademicYear) {
    throwError("Error deleting academic year - Please try again", 500);
  }
  const emitRoom = deletedAcademicYear?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "academicyears", deletedAcademicYear, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
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
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 6 + (logActivityAllowed ? 1 : 0) + deletedAcademicYearPeriods.deletedCount
    },
    {
      field: "databaseStorageAndBackup",
      value: toNegative(getObjectSize(deletedAcademicYear) * 2) + getObjectSize(activityLog) * 2
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([deletedAcademicYear, organisation, role, account, academicYearIdToDelete])
    }
  ]);

  res.status(201).json("successfull");
});
