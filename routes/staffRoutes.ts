import express from "express";
const router = express.Router();

import {
  getStaffProfiles,
  createStaffProfile,
  updateStaffProfile,
  deleteStaffProfile,
  getAllStaffProfiles
} from "../controllers/staffControllers/profileController";

import {
  getStaffContracts,
  createStaffContract,
  updateStaffContract,
  deleteStaffContract,
  getAllStaffContracts
} from "../controllers/staffControllers/contractController";

import {
  getStaffImageViewSignedUrl,
  getStaffImageUploadSignedUrl,
  deleteStaffImageInBucket
} from "../controllers/googleCloudStorage/staffSignedURL";

// end point for staff / profile
router.get("/staff/profiles", getStaffProfiles);
router.get("/staff/all-profiles", getAllStaffProfiles);
router.post("/staff/profile", createStaffProfile);
router.put("/staff/profile", updateStaffProfile);
router.delete("/staff/profile", deleteStaffProfile);

// end point for staff / contracts
router.get("/staff/contracts", getStaffContracts);
router.get("/staff/all-contracts", getAllStaffContracts);
router.post("/staff/contract", createStaffContract);
router.put("/staff/contract", updateStaffContract);
router.delete("/staff/contract", deleteStaffContract);

// request signed url
router.post("/staffimageuploadsignedurl", getStaffImageUploadSignedUrl);
router.post("/staffimageviewsignedurl", getStaffImageViewSignedUrl);
router.delete("/staffimage", deleteStaffImageInBucket);

export default router;
