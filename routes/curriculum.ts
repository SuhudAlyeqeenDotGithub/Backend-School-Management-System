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
  deleteCourseManager,
  getAllCourseManagers
} from "../controllers/curriculum/course/manager";

import { getLevels, createLevel, updateLevel, deleteLevel, getAllLevels } from "../controllers/curriculum/level/level";

import {
  getLevelManagers,
  createLevelManager,
  updateLevelManager,
  deleteLevelManager,
  getAllLevelManagers
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
import {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  getAllSubjects
} from "../controllers/curriculum/subject/subject";

import {
  getSubjectTeachers,
  createSubjectTeacher,
  updateSubjectTeacher,
  deleteSubjectTeacher,
  getAllSubjectTeachers
} from "../controllers/curriculum/subject/teacher";

import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  getAllTopics
} from "../controllers/curriculum/learningplan/topic";

import {
  getSyllabuses,
  createSyllabus,
  updateSyllabus,
  deleteSyllabus,
  getAllSyllabuses
} from "../controllers/curriculum/learningplan/syllabus";

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
router.get("/curriculum/course/allmanagers", getAllCourseManagers);
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
router.get("/curriculum/level/allmanagers", getAllLevelManagers);
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

// end point for curriculum / subjects
router.get("/curriculum/subjects", getSubjects);
router.get("/curriculum/allsubjects", getAllSubjects);
router.post("/curriculum/subject", createSubject);
router.put("/curriculum/subject", updateSubject);
router.delete("/curriculum/subject", deleteSubject);

router.get("/curriculum/subject/teachers", getSubjectTeachers);
router.get("/curriculum/subject/allteachers", getAllSubjectTeachers);
router.post("/curriculum/subject/teacher", createSubjectTeacher);
router.put("/curriculum/subject/teacher", updateSubjectTeacher);
router.delete("/curriculum/subject/teacher", deleteSubjectTeacher);

// end point for curriculum / topics
router.get("/curriculum/topics", getTopics);
router.get("/curriculum/alltopics", getAllTopics);
router.post("/curriculum/topic", createTopic);
router.put("/curriculum/topic", updateTopic);
router.delete("/curriculum/topic", deleteTopic);

// end point for curriculum / syllabus
router.get("/curriculum/syllabuses", getSyllabuses);
router.get("/curriculum/allyllabuses", getAllSyllabuses);
router.post("/curriculum/syllabus", createSyllabus);
router.put("/curriculum/syllabus", updateSyllabus);
router.delete("/curriculum/syllabus", deleteSyllabus);

export default router;
