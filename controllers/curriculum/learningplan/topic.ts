import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  throwError,
  generateSearchText,
  fetchTopics,
  emitToOrganisation,
  checkAccess,
  checkOrgAndUserActiveness,
  confirmUserOrgRole,
  fetchAllTopics,
  getObjectSize,
  toNegative
} from "../../../utils/utilsFunctions";
import { logActivity } from "../../../utils/utilsFunctions";
import { diff } from "deep-diff";

import { Topic } from "../../../models/curriculum/topic";
import { registerBillings } from "../../../utils/billingFunctions.ts";

const validateTopic = (topicDataParam: any) => {
  const {
    description,
    topicDuration,
    offeringStartDate,
    offeringEndDate,
    resources,
    learningObjectives,

    ...copyLocalData
  } = topicDataParam;

  for (const [key, value] of Object.entries(copyLocalData)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      throwError(`Missing Data: Please fill in the ${key} input`, 400);
      return false;
    }
  }

  return true;
};

export const getAllTopics = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, accountStatus, topicId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Topics");

  if (absoluteAdmin || hasAccess) {
    const topicProfiles = await fetchAllTopics(organisation!._id.toString());

    if (!topicProfiles) {
      throwError("Error fetching topic", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + topicProfiles.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([topicProfiles, organisation, role, account])
      }
    ]);
    res.status(201).json(topicProfiles);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view topic- Please contact your admin", 403);
});

export const getTopics = asyncHandler(async (req: Request, res: Response) => {
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

  const { roleId, accountStatus, topicId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, tabAccess, "View Topics");

  if (absoluteAdmin || hasAccess) {
    const result = await fetchTopics(query, cursorType as string, parsedLimit, organisation!._id.toString());

    if (!result || !result.topics) {
      throwError("Error fetching topics", 500);
    }

    registerBillings(req, [
      { field: "databaseOperation", value: 3 + result.topics.length },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([result, organisation, role, account])
      }
    ]);
    res.status(201).json(result);
    return;
  }

  throwError("Unauthorised Action: You do not have access to view topic- Please contact your admin", 403);
});

// controller to handle role creation
export const createTopic = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;

  const { topicCustomId, topic } = body;

  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  // confirm organisation
  const orgParsedId = account!.organisationId!._id.toString();
  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess: creatorTabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Create Topic");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to create topic - Please contact your admin", 403);
  }

  const topicExists = await Topic.findOne({ organisationId: orgParsedId, topicCustomId });
  if (topicExists) {
    throwError(
      "A topic with this Custom Id already exist - Either refer to that record or change the topic custom Id",
      409
    );
  }

  const newTopic = await Topic.create({
    ...body,
    organisationId: orgParsedId,
    searchText: generateSearchText([topicCustomId, topic])
  });

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Topic Creation",
      "Topic",
      newTopic?._id,
      topic,
      [
        {
          kind: "N",
          rhs: {
            _id: newTopic._id,
            topicId: newTopic.topicCustomId,
            topic
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
      value: (getObjectSize(newTopic) + (logActivityAllowed ? getObjectSize(activityLog) : 0)) * 2
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([newTopic, organisation, role, account]) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle role update
export const updateTopic = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const body = req.body;
  const { topicCustomId, topic } = body;

  if (!validateTopic(body)) {
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
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Edit Topic");

  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to edit topic - Please contact your admin", 403);
  }

  const originalTopic = await Topic.findOne({ organisationId: orgParsedId, topicCustomId });

  if (!originalTopic) {
    throwError("An error occured whilst getting old topic data, Ensure it has not been deleted", 500);
  }

  const updatedTopic = await Topic.findByIdAndUpdate(
    originalTopic?._id.toString(),
    {
      ...body,
      searchText: generateSearchText([topicCustomId, topic])
    },
    { new: true }
  );

  if (!updatedTopic) {
    throwError("Error updating topic", 500);
  }

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    const difference = diff(originalTopic, updatedTopic);
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Topic Update",
      "Topic",
      updatedTopic?._id,
      topic,
      difference,
      new Date()
    );
  }

  registerBillings(req, [
    { field: "databaseOperation", value: 6 + (logActivityAllowed ? 2 : 0) },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([updatedTopic, organisation, role, account, originalTopic]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);

  res.status(201).json("successfull");
});

// controller to handle deleting roles
export const deleteTopic = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { topicCustomId } = req.body;
  if (!topicCustomId) {
    throwError("Unknown delete request - Please try again", 400);
  }

  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId: creatorRoleId, accountStatus } = account as any;

  const { absoluteAdmin, tabAccess: creatorTabAccess } = creatorRoleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasAccess = checkAccess(account, creatorTabAccess, "Delete Topic");
  if (!absoluteAdmin && !hasAccess) {
    throwError("Unauthorised Action: You do not have access to delete topic - Please contact your admin", 403);
  }

  const topicToDelete = await Topic.findOne({
    organisationId: organisation?._id.toString(),
    topicCustomId: topicCustomId
  });

  if (!topicToDelete) {
    throwError("Error finding topic with provided Custom Id - Please try again", 404);
  }

  const deletedTopic = await Topic.findByIdAndDelete(topicToDelete?._id.toString());
  if (!deletedTopic) {
    throwError("Error deleting topic - Please try again", 500);
  }

  const emitRoom = deletedTopic?.organisationId?.toString() ?? "";
  emitToOrganisation(emitRoom, "topics", deletedTopic, "delete");

  let activityLog;
  const logActivityAllowed = organisation?.settings?.logActivity;

  if (logActivityAllowed) {
    activityLog = await logActivity(
      account?.organisationId,
      accountId,
      "Topic Delete",
      "Topic",
      deletedTopic?._id,
      deletedTopic?.topic,
      [
        {
          kind: "D" as any,
          lhs: deletedTopic
        }
      ],
      new Date()
    );
  }

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 6 + (logActivityAllowed ? 2 : 0)
    },
    {
      field: "databaseStorageAndBackup",
      value: toNegative(getObjectSize(deletedTopic) * 2) + (logActivityAllowed ? getObjectSize(activityLog) : 0)
    },
    {
      field: "databaseDataTransfer",
      value:
        getObjectSize([deletedTopic, organisation, role, account, topicToDelete]) +
        (logActivityAllowed ? getObjectSize(activityLog) : 0)
    }
  ]);
  res.status(201).json("successfull");
});
