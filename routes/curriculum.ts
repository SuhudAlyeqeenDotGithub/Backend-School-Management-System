import express from "express";
const router = express.Router();

import {
  getProgrammes,
  createProgramme,
  updateProgramme,
  deleteProgramme,
  getAllProgrammes
} from "../controllers/curriculum/programme/programme";

import {
  getProgrammeManagers,
  createProgrammeManager,
  updateProgrammeManager,
  deleteProgrammeManager
} from "../controllers/curriculum/programme/managers";

// end point for curriculum / programme
router.get("/curriculum/programmes", getProgrammes);
router.get("/curriculum/allprogrammes", getAllProgrammes);
router.post("/curriculum/programme", createProgramme);
router.put("/curriculum/programme", updateProgramme);
router.delete("/curriculum/programme", deleteProgramme);

router.get("/curriculum/programme/managers", getProgrammeManagers);
router.post("/curriculum/programme/manager", createProgrammeManager);
router.put("/curriculum/programme/manager", updateProgrammeManager);
router.delete("/curriculum/programme/manager", deleteProgrammeManager);

export default router;
