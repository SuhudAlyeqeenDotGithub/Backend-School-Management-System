import { Storage } from "@google-cloud/storage";
import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { throwError, confirmUserOrgRole, checkOrgAndUserActiveness, checkAccess } from "../../utils/utilsFunctions.ts";
import { nanoid } from "nanoid";

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_KEY_FILE_NAME
});

const bucketName = "alyeqeenappsimages";

export const getStudentImageUploadSignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { imageName, imageType } = req.body;

  const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
  if (!allowedTypes.includes(imageType)) {
    throwError("Unsupported image type", 400);
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
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

    res.status(200).json({ signedUrl, publicUrl, destination });
  } catch (err: any) {
    throwError("Failed to get signed URL:" + err.message, 500);
  }
});

export const getStudentImageViewSignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { imageLocalDestination } = req.body;

  // confirm user
  const { account, organisation } = await confirmUserOrgRole(accountId);

  const { roleId } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasCreateStudentAccess = checkAccess(account, tabAccess, "View Student Profile");

  if (!hasCreateStudentAccess && !absoluteAdmin) {
    throwError("Unauthorised Action: You do not have access to upload image- Please contact your admin", 403);
  }

  const [url] = await storage
    .bucket("my-bucket")
    .file(imageLocalDestination)
    .getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000
    });

  res.json({ url });
});

export const deleteStudentImageInBucket = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, organisationId: userTokenOrgId } = req.userToken;
  const { imageLocalDestination } = req.body;

  if (!imageLocalDestination) {
    res.status(200).json("No image to delete");
    return;
  }
  // confirm user
  const { account, role, organisation } = await confirmUserOrgRole(accountId);

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  const { message, checkPassed } = checkOrgAndUserActiveness(organisation, account);

  if (!checkPassed) {
    throwError(message, 409);
  }

  const hasCreateStudentAccess = checkAccess(account, tabAccess, "Edit Student Profile");

  if (!hasCreateStudentAccess && !absoluteAdmin) {
    throwError("Unauthorised Action: You do not have access to upload image- Please contact your admin", 403);
  }

  try {
    await storage.bucket(bucketName).file(imageLocalDestination).delete();

    res.status(200).json("delete successful");
  } catch (err: any) {
    throwError("Failed to delete image:" + err.message, 500);
  }
});
