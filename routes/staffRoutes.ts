import express from "express";
const router = express.Router();

import {
  getStaffProfiles,
  createStaffProfile,
  updateStaffProfile,
  deleteStaffProfile
} from "../controllers/staffControllers/staffProfileController";
import { getSignedUrl } from "../controllers/googleCloudStorage/signedURL";

// end point for staff / profile
router.get("/staff/profiles", getStaffProfiles);
router.post("/staff/profiles", createStaffProfile);
router.put("/staff/profiles", updateStaffProfile);
router.delete("/staff/profiles", deleteStaffProfile);

export default router;
