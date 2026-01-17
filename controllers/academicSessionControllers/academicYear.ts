import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import {
  fetchAcademicYears,
  emitToOrganisation,
  logActivity,
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  checkAccesses
} from "../../utils/databaseFunctions.ts";

import { throwError, toNegative, getObjectSize } from "../../utils/pureFuctions.ts";

import { diff } from "deep-diff";
import { AcademicYear } from "../../models/timeline/academicYear.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { Period } from "../../models/timeline/period.ts";
import { getNeededAccesses } from "../../utils/defaultVariables.ts";
export const getAcademicYears = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;

  // confirm user
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
  const hasAccess = checkAccesses(account, tabAccess, getNeededAccesses("All Academic Years"));
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to view academic years - Please contact your admin", 403);
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account])
      }
    ]);
  }

  const academicYears = await fetchAcademicYears(organisation!._id.toString());
  if (!academicYears) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account])
      }
    ]);
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
});

// controller to handle role creation
export const createAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { academicYear, startDate, endDate, periods } = req.body;

  // validate input
  if (!academicYear || !startDate || !endDate || !Array.isArray(periods) || periods.length === 0) {
    throwError("Please fill in all required fields", 400);
  }

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();

  const yearNameExists = await AcademicYear.findOne({ organisationId: orgParsedId, academicYear }).lean();
  if (yearNameExists) {
    throwError("This academic year name is already in use in this organisation - Please use a different name", 409);
  }

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Academic Year");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, yearNameExists]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create academic year - Please contact your admin", 403);
  }

  const newAcademicYear = await AcademicYear.create({
    academicYear,
    startDate,
    endDate,
    organisationId: orgParsedId
  });

  if (!newAcademicYear) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, yearNameExists]) }
    ]);
    throwError("Error creating academic year", 500);
  }

  const academicYearTaggedPeriods = periods.map(
    (period: { period: string; startDate: string; endDate: string; customId: string }) => ({
      organisationId: orgParsedId,
      customId: period.customId,
      academicYearId: newAcademicYear?._id,
      period: period.period,
      startDate: period.startDate,
      endDate: period.endDate
    })
  );

  const createdPeriods = await Period.insertMany(academicYearTaggedPeriods, { ordered: true });

  if (!createdPeriods) {
    registerBillings(req, [
      { field: "databaseOperation", value: 8 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, yearNameExists]) }
    ]);
    throwError("Error creating academic year periods", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
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
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) + createdPeriods?.length * 2 },
    {
      field: "databaseStorageAndBackup",
      value: getObjectSize([newAcademicYear, createdPeriods]) * 2
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([newAcademicYear, organisation, role, account, yearNameExists, createdPeriods])
    }
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
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Academic Year");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit academic year - Please contact your admin", 403);
  }

  const originalAcademicYear = await AcademicYear.findById(academicYearId).lean();

  if (!originalAcademicYear) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
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
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, originalAcademicYear]) }
    ]);
    throwError("Error updating academic year", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalAcademicYear, updatedAcademicYear);
    await logActivity(
      req,
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
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([updatedAcademicYear, organisation, role, account, originalAcademicYear])
    }
  ]);

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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Academic Year");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete academic year - Please contact your admin", 403);
  }

  const deletedAcademicYearPeriods = await Period.deleteMany(
    { academicYearId: academicYearIdToDelete },
    { ordered: true }
  );

  if (!deletedAcademicYearPeriods.acknowledged) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting academic year periods - Please try again", 500);
  }

  const deletedAcademicYear = await AcademicYear.findByIdAndDelete(academicYearIdToDelete).lean();
  if (!deletedAcademicYear) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting academic year - Please try again", 500);
  }
  const emitRoom = deletedAcademicYear?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "academicyears", deletedAcademicYear, "delete");

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Academic Year Deletion",
      "AcademicYear",
      deletedAcademicYear?._id,
      deletedAcademicYear?.academicYear,
      [
        {
          kind: "D" as any,
          lhs: deletedAcademicYear
        }
      ],
      new Date()
    );
  }

  let oneRecordSize = 0.0000003;

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 5 + (logActivityAllowed ? 2 : 0) + deletedAcademicYearPeriods.deletedCount
    },
    {
      field: "databaseStorageAndBackup",
      value:
        toNegative(getObjectSize(deletedAcademicYear) * 2) +
        toNegative(getObjectSize(oneRecordSize) * deletedAcademicYearPeriods.deletedCount * 2)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([deletedAcademicYear, oneRecordSize, organisation, role, account, academicYearIdToDelete])
    }
  ]);

  res.status(201).json("successfull");
});
