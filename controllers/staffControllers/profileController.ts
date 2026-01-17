import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  fetchStaffProfiles,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllStaffProfiles,
  validatePhoneNumber,
  checkAccesses
} from "../../utils/databaseFunctions.ts";
import { logActivity } from "../../utils/databaseFunctions.ts";
import { diff } from "deep-diff";
import { throwError, toNegative, validateEmail, generateSearchText, getObjectSize } from "../../utils/pureFuctions.ts";
import { Staff } from "../../models/staff/profile.ts";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { getNeededAccesses } from "../../utils/defaultVariables.ts";

const validateStaffProfile = (staffDataParam: any) => {
  const {
    imageUrl,
    imageLocalDestination,
    qualifications,
    workExperience,
    identifications,
    skills,
    postCode,
    endDate,
    ...copyLocalData
  } = staffDataParam;

  if (!validateEmail(staffDataParam.email)) {
    throwError("Please enter a valid email address.", 400);
    return false;
  }

  if (!validateEmail(staffDataParam.nextOfKinEmail)) {
    throwError("Please enter a valid next of kin email address.", 400);
    return false;
  }

  if (!validatePhoneNumber(staffDataParam.phone)) {
    throwError("Please enter a valid phone number with the country code. e.g +234, +447", 400);
    return false;
  }

  if (!validatePhoneNumber(staffDataParam.nextOfKinPhone)) {
    throwError("Please enter a valid next of kin phone number with the country code. e.g +234, +447", 400);
    return false;
  }

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllStaffProfiles = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccesses(account, tabAccess, getNeededAccesses("All Staff Profiles"));

  if (absoluteAdmin || hasAccess) {
    const staffProfiles = await fetchAllStaffProfiles(
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      absoluteAdmin ? "" : staffId.customId.toString()
    );

    if (!staffProfiles) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError("Error fetching staff profiles", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + staffProfiles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([staffProfiles, organisation, role, account])
      }
    ]);
    res.status(201).json(staffProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view staff profile - Please contact your admin", 403);
});

export const getStaffProfiles = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, tabAccess, "View Staff Profiles");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchStaffProfiles(
      query,
      cursorType as string,
      parsedLimit,
      absoluteAdmin ? "Absolute Admin" : "User",
      organisation!._id.toString(),
      absoluteAdmin ? "" : staffId.customId.toString()
    );

    if (!result || !result.staffProfiles) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError("Error fetching staff profiles", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.staffProfiles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view staff profile - Please contact your admin", 403);
});

// controller to handle role creation
export const createStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { customId, fullName, dateOfBirth, gender, email, nationality, nextOfKinName, nextOfKinEmail } = body;

  if (!validateStaffProfile(body)) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Create Staff Profile");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to create staff - Please contact your admin", 403);
  }

  const orConditions: any[] = [{ customId }];
  if (email) {
    orConditions.push({ email });
  }

  const staffExists = await Staff.findOne({
    organisationId: orgParsedId,
    $or: orConditions
  }).lean();

  if (staffExists) {
    if (staffExists.customId === customId) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError(
        "A staff with this Custom Id already exists within the organisation - Either refer to that record or change the staff custom Id",
        409
      );
    }
    if (staffExists.email === email) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError("A staff already uses this email within the organisation - use another email", 409);
    }
  }

  const newStaff = await Staff.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([
      customId,
      fullName,
      gender,
      email,
      dateOfBirth,
      nationality,
      nextOfKinName,
      nextOfKinEmail
    ])
  });

  if (!newStaff) {
    registerBillings(req, [
      { field: "databaseOperation", value: 6 },
      { field: "databaseDataTransfer", value: getObjectSize([newStaff, staffExists, organisation, role, account]) }
    ]);
    throwError("Error creating staff profile - Please try again", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Staff Profile Creation",
      "Staff",
      newStaff?._id,
      fullName,
      [
        {
          kind: "N",
          rhs: {
            _id: newStaff._id,
            staffId: newStaff.customId,
            fullName
          }
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseStorageAndBackup",
      value: getObjectSize(newStaff) * 2
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([newStaff, staffExists, organisation, role, account])
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const body = req.body;
  const { _id, customId, fullName, dateOfBirth, gender, email, nationality, nextOfKinName, nextOfKinEmail } = body;

  if (!validateStaffProfile(body)) {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Staff Profile");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to edit staff - Please contact your admin", 403);
  }

  let emailInUse;
  if (email) {
    emailInUse = await Staff.findOne({ organisationId: orgParsedId, email }).lean();

    if (emailInUse && emailInUse._id.toString() !== _id) {
      registerBillings(req, [
        { field: "databaseOperation", value: 4 },
        { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
      ]);
      throwError("A staff already uses this email within the organisation - use another email", 409);
    }
  }

  const originalStaff = await Staff.findOne({ organisationId: orgParsedId, customId }).lean();

  if (!originalStaff) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account, emailInUse]) }
    ]);
    throwError("An error occured whilst getting old staff data", 500);
  }

  const updatedStaff = await Staff.findByIdAndUpdate(
    originalStaff?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([
        customId,
        fullName,
        gender,
        email,
        dateOfBirth,
        nationality,
        nextOfKinName,
        nextOfKinEmail
      ])
    },
    { new: true }
  ).lean();

  if (!updatedStaff) {
    registerBillings(req, [
      { field: "databaseOperation", value: 7 },
      { field: "databaseDataTransfer", value: getObjectSize([originalStaff, organisation, role, account, emailInUse]) }
    ]);
    throwError("Error updating staff profile", 500);
  }

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalStaff, updatedStaff);
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Staff Profile Update",
      "Staff",
      updatedStaff?._id,
      fullName,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 7 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([updatedStaff, organisation, role, account, emailInUse, originalStaff])
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteStaffProfile = asyncHandler(async (req: Request, res: Response) => {
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
  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Staff Profile");

  if (!absoluteAdmin && !hasAccess) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Unauthorised Action: You do not have access to delete staff profile - Please contact your admin", 403);
  }

  const deletedStaffProfile = await Staff.findByIdAndDelete(_id).lean();
  if (!deletedStaffProfile) {
    registerBillings(req, [
      { field: "databaseOperation", value: 5 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError("Error deleting staff profile - Please try again", 500);
  }

  const emitRoom = deletedStaffProfile?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "staffs", deletedStaffProfile, "delete");

  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    await logActivity(
      req,
      account?.organisationId,
      accountId,
      "Staff Delete",
      "Staff",
      deletedStaffProfile?._id,
      deletedStaffProfile?.fullName,
      [
        {
          kind: "D" as any,
          lhs: deletedStaffProfile
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
      value: toNegative(getObjectSize(deletedStaffProfile) * 2)
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([deletedStaffProfile, organisation, role, account])
    }
  ]);
  res.status(201).json("successfull");
});
