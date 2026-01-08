import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { confirmUserOrgRole, checkOrgAndUserActiveness, checkAccess } from "../../utils/databaseFunctions.ts";
import { throwError, getObjectSize } from "../../utils/pureFuctions.ts";
import { Pathway, PathwayManager } from "../../models/curriculum/pathway.ts";
import { Class, ClassTutor } from "../../models/curriculum/class.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { Programme, ProgrammeManager } from "../../models/curriculum/programme.ts";
import { BaseSubjectManager } from "../../models/curriculum/basesubject.ts";
import { ClassSubjectTeacher } from "../../models/curriculum/classSubject.ts";

export const getDayAttendanceRequiredCurriculum = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
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
  const hasAccess =
    checkAccess(account, tabAccess, "View Classes") ||
    checkAccess(account, tabAccess, "View Programmes") ||
    checkAccess(account, tabAccess, "View Pathways") ||
    checkAccess(account, tabAccess, "View Student Day Attendances (Admin Access)") ||
    checkAccess(account, tabAccess, "View Student Subject Attendances (Admin Access)");

  let pathwayManagementDocs;
  let classManagementDocs;
  let programmeManagementDocs;

  let query: any = { organisationId: userTokenOrgId };

  if (!absoluteAdmin && !hasAccess) {
    programmeManagementDocs = await ProgrammeManager.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();
    pathwayManagementDocs = await PathwayManager.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();
    classManagementDocs = await ClassTutor.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();

    let programmesManaged: any = [];
    if (programmeManagementDocs && programmeManagementDocs.length > 0) {
      programmesManaged = programmeManagementDocs.map((doc) => doc.programmeId);
    }

    let pathwaysManaged: any = [];
    if (pathwayManagementDocs && pathwayManagementDocs.length > 0) {
      pathwaysManaged = pathwayManagementDocs.map((doc) => doc.pathwayId);
    }

    let classesManaged: any = [];
    if (classManagementDocs && classManagementDocs.length > 0) {
      classesManaged = classManagementDocs.map((doc) => doc.classId);
    }

    query["$or"] = [
      { programmeId: { $in: programmesManaged } },
      { pathwayId: { $in: pathwaysManaged } },
      { _id: { $in: classesManaged } }
    ];
  }

  const classes = await Class.find(query).lean();

  if (!classes) {
    registerBillings(req, [
      {
        field: "databaseOperation",
        value:
          4 +
          (pathwayManagementDocs ? pathwayManagementDocs.length : 0) +
          (classManagementDocs ? classManagementDocs.length : 0) +
          (programmeManagementDocs ? programmeManagementDocs.length : 0)
      },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          classes,
          pathwayManagementDocs,
          classManagementDocs,
          programmeManagementDocs,
          organisation,
          role,
          account
        ])
      }
    ]);
    throwError("Error fetching classes", 500);
  }

  const classesProgrammes = classes.map((cls) => cls.programmeId);
  const classesPathways = classes.map((cls) => cls.pathwayId).filter((pid) => pid != null);

  let programmes: any = [];
  let pathways: any = [];
  if (classesProgrammes.length > 0) {
    programmes = await Programme.find({
      _id: { $in: classesProgrammes }
    }).lean();
  }
  if (classesPathways.length > 0) {
    pathways = await Pathway.find({
      _id: { $in: classesPathways }
    }).lean();
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value:
        3 +
        classes.length +
        programmes.length +
        pathways.length +
        (pathwayManagementDocs ? pathwayManagementDocs.length : 0) +
        (classManagementDocs ? classManagementDocs.length : 0) +
        (programmeManagementDocs ? programmeManagementDocs.length : 0)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([
        classes,
        programmes,
        pathways,
        pathwayManagementDocs,
        classManagementDocs,
        organisation,
        role,
        account,
        programmeManagementDocs
      ])
    }
  ]);

  res.status(201).json({ classes, programmes, pathways });
  return;
});

export const getAllAuthorizedClassSubjects = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;

  // confirm user
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
  const hasAccess =
    checkAccess(account, tabAccess, "View Class Subjects") ||
    checkAccess(account, tabAccess, "View Base Subjects") ||
    checkAccess(account, tabAccess, "View Student Day Attendances (Admin Access)") ||
    checkAccess(account, tabAccess, "View Student Subject Attendances (Admin Access)");

  let pathwayManagementDocs;
  let classManagementDocs;
  let programmeManagementDocs;
  let baseSubjectManagementDocs;
  let classSubjectManagementDocs;

  let query: any = { organisationId: userTokenOrgId };

  if (!absoluteAdmin && !hasAccess) {
    programmeManagementDocs = await ProgrammeManager.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();
    pathwayManagementDocs = await PathwayManager.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();
    classManagementDocs = await ClassTutor.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();

    baseSubjectManagementDocs = await BaseSubjectManager.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();
    classSubjectManagementDocs = await ClassSubjectTeacher.find({
      organisationId: userTokenOrgId,
      staffId,
      status: "Active"
    }).lean();

    let programmesManaged: any = [];
    if (programmeManagementDocs && programmeManagementDocs.length > 0) {
      programmesManaged = programmeManagementDocs.map((doc) => doc.programmeId);
    }

    let pathwaysManaged: any = [];
    if (pathwayManagementDocs && pathwayManagementDocs.length > 0) {
      pathwaysManaged = pathwayManagementDocs.map((doc) => doc.pathwayId);
    }

    let classesManaged: any = [];
    if (classManagementDocs && classManagementDocs.length > 0) {
      classesManaged = classManagementDocs.map((doc) => doc.classId);
    }

    let baseSubjectsManaged: any = [];
    if (baseSubjectManagementDocs && baseSubjectManagementDocs.length > 0) {
      baseSubjectsManaged = baseSubjectManagementDocs.map((doc) => doc.baseSubjectId);
    }

    let classSubjectsManaged: any = [];
    if (classSubjectManagementDocs && classSubjectManagementDocs.length > 0) {
      classSubjectsManaged = classSubjectManagementDocs.map((doc) => doc._id);
    }

    query["$or"] = [
      { programmeId: { $in: programmesManaged } },
      { pathwayId: { $in: pathwaysManaged } },
      { classId: { $in: classesManaged } },
      { baseSubjectId: { $in: baseSubjectsManaged } },
      { _id: { $in: classSubjectsManaged } }
    ];
  }

  const results = await Class.find(query).lean();

  if (!results) {
    registerBillings(req, [
      {
        field: "databaseOperation",
        value:
          4 +
          (pathwayManagementDocs ? pathwayManagementDocs.length : 0) +
          (classManagementDocs ? classManagementDocs.length : 0) +
          (programmeManagementDocs ? programmeManagementDocs.length : 0) +
          (baseSubjectManagementDocs ? baseSubjectManagementDocs.length : 0) +
          (classSubjectManagementDocs ? classSubjectManagementDocs.length : 0)
      },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([
          results,
          pathwayManagementDocs,
          classManagementDocs,
          programmeManagementDocs,
          baseSubjectManagementDocs,
          classSubjectManagementDocs,
          organisation,
          role,
          account
        ])
      }
    ]);
    throwError("Error fetching class subjects", 500);
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value:
        3 +
        results.length +
        (pathwayManagementDocs ? pathwayManagementDocs.length : 0) +
        (classManagementDocs ? classManagementDocs.length : 0) +
        (programmeManagementDocs ? programmeManagementDocs.length : 0) +
        (baseSubjectManagementDocs ? baseSubjectManagementDocs.length : 0) +
        (classSubjectManagementDocs ? classSubjectManagementDocs.length : 0)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([
        results,
        pathwayManagementDocs,
        classManagementDocs,
        programmeManagementDocs,
        baseSubjectManagementDocs,
        classSubjectManagementDocs,
        organisation,
        role,
        account
      ])
    }
  ]);

  res.status(201).json(results);
  return;
});
