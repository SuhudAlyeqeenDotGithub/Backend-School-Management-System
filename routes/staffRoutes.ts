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
router.get("/staff/profile.tss", getStaffProfiles);
router.post("/staff/profile.tss", createStaffProfile);
router.put("/staff/profile.tss", updateStaffProfile);
router.delete("/staff/profile.tss", deleteStaffProfile);

// end point for staff / contracts
router.get("/staff/contracts.ts", getStaffContracts);
router.post("/staff/contracts.ts", createStaffContract);
router.put("/staff/contracts.ts", updateStaffContract);
router.delete("/staff/contracts.ts", deleteStaffContract);
export default router;
