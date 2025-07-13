import express from "express";
const router = express.Router();

import {
  getStaffProfiles,
  createStaffProfile,
  updateStaffProfile,
  deleteStaffProfile
} from "../controllers/staffControllers/profileController";

import {
  getStaffContracts,
  createStaffContract,
  updateStaffContract,
  deleteStaffContract
} from "../controllers/staffControllers/contractController";

// end point for staff / profile
router.get("/staff/profiles", getStaffProfiles);
router.post("/staff/profiles", createStaffProfile);
router.put("/staff/profiles", updateStaffProfile);
router.delete("/staff/profiles", deleteStaffProfile);

// end point for staff / contracts
router.get("/staff/contracts", getStaffContracts);
router.post("/staff/contracts", createStaffContract);
router.put("/staff/contracts", updateStaffContract);
router.delete("/staff/contracts", deleteStaffContract);
export default router;
