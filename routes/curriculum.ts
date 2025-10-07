import express from "express";
const router = express.Router();

import {
  getProgrammes,
  createProgramme,
  updateProgramme,
  deleteProgramme,
  getAllProgrammes
} from "../controllers/curriculum/programme";

// end point for curriculum / programme
router.get("/curriculum/programmes", getProgrammes);
router.get("/curriculum/allprogrammes", getAllProgrammes);
router.post("/curriculum/programme", createProgramme);
router.put("/curriculum/programme", updateProgramme);
router.delete("/curriculum/programme", deleteProgramme);

export default router;
