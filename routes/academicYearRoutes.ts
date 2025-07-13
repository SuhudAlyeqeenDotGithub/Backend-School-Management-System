import express from "express";
const router = express.Router();

import {
  getAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear
} from "../controllers/general/academicYear";

router.get("/academicyears", getAcademicYears);
router.post("/academicyears", createAcademicYear);
router.put("/academicyears", updateAcademicYear);
router.delete("/academicyears", deleteAcademicYear);

export default router;
