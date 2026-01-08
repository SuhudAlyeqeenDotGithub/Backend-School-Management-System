import { Storage } from "@google-cloud/storage";
import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import {
  confirmUserOrgRole,
  checkOrgAndUserActiveness,
  checkAccess,
  getGoogleCloudFileSize
} from "../../utils/databaseFunctions.ts";
import { nanoid } from "nanoid";
import { registerBillings } from "../../utils/billingFunctions.ts";
import { throwError, toNegative, getObjectSize } from "../../utils/pureFuctions.ts";

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_KEY_FILE_NAME
});

const bucketName = "alyeqeenappsimages";

export const getStudentImageUploadSignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { imageName, imageType } = req.body;

  const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
  if (!allowedTypes.includes(imageType)) {
    throwError("Unsupported image type", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const orgHasRequiredFeature = organisation?.features
    ?.map((feature) => feature.name)
    .includes("Student Profile & Enrollment");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Profile & Enrollment to use it",
      403
    );
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
  const hasCreateStudentAccess = checkAccess(account, tabAccess, "Create Student Profile");

  if (!hasCreateStudentAccess && !absoluteAdmin) {
    throwError("Unauthorised Action: You do not have access to upload image- Please contact your admin", 403);
  }

  const destination = `${nanoid()}-${imageName}`;

  const signedUrlOptions = {
    version: "v4" as const,
    action: "write" as const,
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: imageType
  };

  try {
    const file = storage.bucket(bucketName).file(destination);
    const [signedUrl] = await file.getSignedUrl(signedUrlOptions);

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

    registerBillings(req, [
      {
        field: "databaseOperation",
        value: 3
      },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account])
      },
      {
        field: "cloudStorageUploadOperation",
        value: 1
      },
      {
        field: "cloudStorageGBStored",
        value: (await getGoogleCloudFileSize(file)) || 0
      }
    ]);

    res.status(200).json({ signedUrl, publicUrl, destination });
  } catch (err: any) {
    throwError("Failed to get signed URL:" + err.message, 500);
  }
});

export const getStudentImageViewSignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { imageLocalDestination } = req.body;

  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const orgHasRequiredFeature = organisation?.features
    ?.map((feature) => feature.name)
    .includes("Student Profile & Enrollment");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Profile & Enrollment to use it",
      403
    );
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
  const hasCreateStudentAccess = checkAccess(account, tabAccess, "View Student Profile");

  if (!hasCreateStudentAccess && !absoluteAdmin) {
    throwError("Unauthorised Action: You do not have access to view image- Please contact your admin", 403);
  }

  const file = storage.bucket(bucketName).file(imageLocalDestination);

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000
  });

  registerBillings(req, [
    {
      field: "databaseOperation",
      value: 3
    },
    {
      field: "databaseDataTransfer",
      value: getObjectSize([organisation, role, account])
    },
    {
      field: "cloudStorageDownloadOperation",
      value: 1
    },
    {
      field: "cloudStorageGBDownloaded",
      value: (await getGoogleCloudFileSize(file)) || 0
    }
  ]);

  res.json({ url });
});

export const deleteStudentImageInBucket = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { imageLocalDestination } = req.body;

  if (!imageLocalDestination) {
    res.status(200).json("No image to delete");
    return;
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);
  const orgHasRequiredFeature = organisation?.features
    ?.map((feature) => feature.name)
    .includes("Student Profile & Enrollment");
  if (!orgHasRequiredFeature) {
    throwError(
      "This feature is not enabled for this organisation - You need to purchase Student Profile & Enrollment to use it",
      403
    );
  }

  const { roleId, status } = account as any;
  const { absoluteAdmin, tabAccess } = roleId ?? { absoluteAdmin: false, tabAccess: [] };

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    registerBillings(req, [
      { field: "databaseOperation", value: 3 },
      { field: "databaseDataTransfer", value: getObjectSize([organisation, role, account]) }
    ]);
    throwError(message, 409);
  }
  const hasCreateStudentAccess = checkAccess(account, tabAccess, "Edit Student Profile");

  if (!hasCreateStudentAccess && !absoluteAdmin) {
    throwError("Unauthorised Action: You do not have access to upload image- Please contact your admin", 403);
  }

  try {
    const file = storage.bucket(bucketName).file(imageLocalDestination);

    await file.delete();

    registerBillings(req, [
      {
        field: "databaseOperation",
        value: 3
      },
      {
        field: "databaseDataTransfer",
        value: getObjectSize([organisation, role, account])
      },
      {
        field: "cloudStorageGBStored",
        value: toNegative(await getGoogleCloudFileSize(file)) || 0
      }
    ]);

    res.status(200).json("delete successful");
  } catch (err: any) {
    throwError("Failed to delete image:" + err.message, 500);
  }
});
