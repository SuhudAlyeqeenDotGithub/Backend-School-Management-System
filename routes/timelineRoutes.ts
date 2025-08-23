import express from "express";
const router = express.Router();

import {
  getAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear
} from "../controllers/timeline/academicYear";
import { createPeriod, updatePeriod, deletePeriod } from "../controllers/timeline/period";

router.get("/academicyear", getAcademicYears);
router.post("/academicyear", createAcademicYear);
router.put("/academicyear", updateAcademicYear);
router.delete("/academicyear", deleteAcademicYear);
router.post("/period", createPeriod);
router.put("/period", updatePeriod);
router.delete("/period", deletePeriod);

export default router;
