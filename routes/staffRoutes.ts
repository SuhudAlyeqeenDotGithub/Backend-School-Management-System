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
router.get("/staff/profile", getStaffProfiles);
router.post("/staff/profile", createStaffProfile);
router.put("/staff/profile", updateStaffProfile);
router.delete("/staff/profile", deleteStaffProfile);

// end point for staff / contracts
router.get("/staff/contract", getStaffContracts);
router.post("/staff/contract", createStaffContract);
router.put("/staff/contract", updateStaffContract);
router.delete("/staff/contract", deleteStaffContract);
export default router;
