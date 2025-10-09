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
} from "../controllers/curriculum/programme/manager";

import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getAllCourses
} from "../controllers/curriculum/course/course";

import {
  getCourseManagers,
  createCourseManager,
  updateCourseManager,
  deleteCourseManager
} from "../controllers/curriculum/course/manager";

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

// end point for curriculum / course
router.get("/curriculum/courses", getCourses);
router.get("/curriculum/allcourses", getAllCourses);
router.post("/curriculum/course", createCourse);
router.put("/curriculum/course", updateCourse);
router.delete("/curriculum/course", deleteCourse);

router.get("/curriculum/course/managers", getCourseManagers);
router.post("/curriculum/course/manager", createCourseManager);
router.put("/curriculum/course/manager", updateCourseManager);
router.delete("/curriculum/course/manager", deleteCourseManager);

export default router;
