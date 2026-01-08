import { registerBillings } from "../../utils/billingFunctions";
import { checkAccess, checkOrgAndUserActiveness, confirmRole, confirmUserOrgRole } from "../../utils/databaseFunctions";
import { getObjectSize, throwError } from "../../utils/pureFuctions";

import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { ActivityLog } from "../../models/admin/activityLogModel";

export const getRecentPathwayActivities = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId } = req.userToken;
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
  const hasAccess = checkAccess(account, tabAccess, "View Pathways");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view pathways - Please contact your admin", 403);
  }

  const activities = await ActivityLog.find(
    {
      organisationId,
      recordModel: { $in: ["Pathway", "PathwayManager"] }
    },
    "_id logAction createdAt recordName"
  )
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (!activities) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, activities]) }
    ]);
    throwError("Error fetching activitie", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + activities.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([activities, organisation, role, account])
    }
  ]);
  res.status(201).json(activities);
  return;
});

export const getRecentProgrammeActivities = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId } = req.userToken;
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
  const hasAccess = checkAccess(account, tabAccess, "View Programmes");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view programmes - Please contact your admin", 403);
  }

  const activities = await ActivityLog.find(
    {
      organisationId,
      recordModel: { $in: ["Programme", "ProgrammeManager"] }
    },
    "_id logAction createdAt recordName"
  )
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (!activities) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, activities]) }
    ]);
    throwError("Error fetching activitie", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + activities.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([activities, organisation, role, account])
    }
  ]);
  res.status(201).json(activities);
  return;
});

export const getRecentClassActivities = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId } = req.userToken;
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
  const hasAccess = checkAccess(account, tabAccess, "View Classes");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to view classes - Please contact your admin", 403);
  }

  const activities = await ActivityLog.find(
    {
      organisationId,
      recordModel: { $in: ["Class", "ClassTutor"] }
    },
    "_id logAction createdAt recordName"
  )
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (!activities) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, activities]) }
    ]);
    throwError("Error fetching activitie", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + activities.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([activities, organisation, role, account])
    }
  ]);
  res.status(201).json(activities);
  return;
});

export const getRecentSubjectActivities = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId } = req.userToken;
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
  const hasAccess =
    checkAccess(account, tabAccess, "View Class Subjects") || checkAccess(account, tabAccess, "View Base Subjects");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(
      "Unauthorised Action: You do not have access to view class or base subjects - Please contact your admin",
      403
    );
  }

  const classSubjectActivities = await ActivityLog.find(
    {
      organisationId,
      recordModel: { $in: ["ClassSubject", "ClassSubjectTeacher"] }
    },
    "_id logAction createdAt recordName"
  )
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (!classSubjectActivities) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error fetching class subject activities", 500);
  }

  const baseSubjectActivities = await ActivityLog.find(
    {
      organisationId,
      recordModel: { $in: ["BaseSubject", "BaseSubjectManager"] }
    },
    "_id logAction createdAt recordName"
  )
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (!baseSubjectActivities) {
    registerBillings(req, [
      { field: "databaseOperation", value: 4 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, classSubjectActivities]) }
    ]);
    throwError("Error fetching base subject activities", 500);
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 3 + classSubjectActivities.length + baseSubjectActivities.length },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([classSubjectActivities, baseSubjectActivities, organisation, role, account])
    }
  ]);
  res.status(201).json({ classSubjectActivities, baseSubjectActivities });
  return;
});
