import { Storage } from "@google-cloud/storage";
import asyncHandler from "express-async-handler";
import { Request, Response } from "express";
import { throwError, confirmAccount, confirmRole } from "../../utils/utilsFunctions";
import { nanoid } from "nanoid";

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_KEY_FILE_NAME
});

const bucketName = "alyeqeenappsimages";

declare global {
  namespace Express {
    interface Request {
      userToken?: any;
    }
  }
}

export const getSignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.userToken;
  const { imageName, imageType } = req.body;

  const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
  if (!allowedTypes.includes(imageType)) {
    throwError("Unsupported image type", 400);
  }
  // confirm user
  const account = await confirmAccount(accountId);

  // confirm organisation
  const organisation = await confirmAccount(account!.organisationId!._id.toString());

  // confirm role
  const role = await confirmRole(account!.roleId!._id.toString());

  const { roleId, accountStatus } = account as any;
  const { absoluteAdmin, tabAccess } = roleId;

  if (accountStatus === "Locked" || accountStatus !== "Active") {
    throwError("Your account is no longer active - Please contact your admin", 409);
  }

  const hasCreateStudentAccess = tabAccess
    .filter(({ tab }: any) => tab === "Admin")[0]
    .actions.some(({ name }: any) => name === "Create Student");

  const hasCreateStaffAccess = tabAccess
    .filter(({ tab }: any) => tab === "Admin")[0]
    .actions.some(({ name }: any) => name === "Create Staff");

  if (!hasCreateStaffAccess && !hasCreateStudentAccess && !absoluteAdmin) {
    throwError("Unauthorised Action: You do not have access to upload image- Please contact your admin", 403);
  }

  const destination = `alyeqeenschoolappimages/${nanoid()}-${imageName}`;

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

    res.status(200).json({ signedUrl, publicUrl });
  } catch (err: any) {
    throwError("Failed to get signed URL:" + err.message, 500);
  }
});
