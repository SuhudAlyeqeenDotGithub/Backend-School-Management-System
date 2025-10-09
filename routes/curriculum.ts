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

import { getLevels, createLevel, updateLevel, deleteLevel, getAllLevels } from "../controllers/curriculum/level/level";

import {
  getLevelManagers,
  createLevelManager,
  updateLevelManager,
  deleteLevelManager
} from "../controllers/curriculum/level/manager";

import {
  getBaseSubjects,
  createBaseSubject,
  updateBaseSubject,
  deleteBaseSubject,
  getAllBaseSubjects
} from "../controllers/curriculum/basesubject/basesubject";

import {
  getBaseSubjectManagers,
  createBaseSubjectManager,
  updateBaseSubjectManager,
  deleteBaseSubjectManager
} from "../controllers/curriculum/basesubject/manager";

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

// end point for curriculum / level
router.get("/curriculum/levels", getLevels);
router.get("/curriculum/alllevels", getAllLevels);
router.post("/curriculum/level", createLevel);
router.put("/curriculum/level", updateLevel);
router.delete("/curriculum/level", deleteLevel);

router.get("/curriculum/level/managers", getLevelManagers);
router.post("/curriculum/level/manager", createLevelManager);
router.put("/curriculum/level/manager", updateLevelManager);
router.delete("/curriculum/level/manager", deleteLevelManager);

// end point for curriculum / basesubject
router.get("/curriculum/basesubjects", getBaseSubjects);
router.get("/curriculum/allbasesubjects", getAllBaseSubjects);
router.post("/curriculum/basesubject", createBaseSubject);
router.put("/curriculum/basesubject", updateBaseSubject);
router.delete("/curriculum/basesubject", deleteBaseSubject);

router.get("/curriculum/basesubject/managers", getBaseSubjectManagers);
router.post("/curriculum/basesubject/manager", createBaseSubjectManager);
router.put("/curriculum/basesubject/manager", updateBaseSubjectManager);
router.delete("/curriculum/basesubject/manager", deleteBaseSubjectManager);

export default router;
