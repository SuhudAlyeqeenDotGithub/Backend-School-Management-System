import express from "express";
const router = express.Router();

import {
  getAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear
} from "../controllers/timeline/academicYear";
import { createPeriod, updatePeriod, deletePeriod } from "../controllers/timeline/period";

router.get("/academicyears", getAcademicYears);
router.post("/academicyears", createAcademicYear);
router.put("/academicyears", updateAcademicYear);
router.delete("/academicyears", deleteAcademicYear);
router.post("/period", createPeriod);
router.put("/period", updatePeriod);
router.delete("/period", deletePeriod);

export default router;
