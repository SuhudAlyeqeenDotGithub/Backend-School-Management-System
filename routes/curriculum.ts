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
  getPathways,
  createPathway,
  updatePathway,
  deletePathway,
  getAllPathways
} from "../controllers/curriculum/pathway/pathway";

import {
  getPathwayManagers,
  createPathwayManager,
  updatePathwayManager,
  deletePathwayManager,
  getAllPathwayManagers
} from "../controllers/curriculum/pathway/manager";

import {
  getClasses,
  createClass,
  updateClass,
  deleteClass,
  getAllClasses
} from "../controllers/curriculum/class/class";

import {
  getClassTutors,
  createClassTutor,
  updateClassTutor,
  deleteClassTutor,
  getAllClassTutors
} from "../controllers/curriculum/class/tutor";

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
  getClassSubjects,
  createClassSubject,
  updateClassSubject,
  deleteClassSubject,
  getAllClassSubjects
} from "../controllers/curriculum/classSubject/classSubject";

import {
  getClassSubjectTeachers,
  createClassSubjectTeacher,
  updateClassSubjectTeacher,
  deleteClassSubjectTeacher,
  getAllClassSubjectTeachers
} from "../controllers/curriculum/classSubject/teacher";

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
import { createStage, getStages, updateStage, deleteStage } from "../controllers/stage/stage";

// end point for curriculum / programme
router.get("/curriculum/programmes", getProgrammes);
router.get("/curriculum/all-programmes", getAllProgrammes);
router.post("/curriculum/programme", createProgramme);
router.put("/curriculum/programme", updateProgramme);
router.delete("/curriculum/programme", deleteProgramme);

// end point for curriculum / programme manager

router.get("/curriculum/programme/managers", getProgrammeManagers);
router.post("/curriculum/programme/manager", createProgrammeManager);
router.put("/curriculum/programme/manager", updateProgrammeManager);
router.delete("/curriculum/programme/manager", deleteProgrammeManager);

// end point for curriculum / stage
router.get("/curriculum/stages", getStages);
router.post("/curriculum/stage", createStage);
router.put("/curriculum/stage", updateStage);
router.delete("/curriculum/stage", deleteStage);

// end point for curriculum / pathway
router.get("/curriculum/pathways", getPathways);
router.get("/curriculum/all-pathways", getAllPathways);
router.post("/curriculum/pathway", createPathway);
router.put("/curriculum/pathway", updatePathway);
router.delete("/curriculum/pathway", deletePathway);

router.get("/curriculum/pathway/managers", getPathwayManagers);
router.get("/curriculum/pathway/all-managers", getAllPathwayManagers);
router.post("/curriculum/pathway/manager", createPathwayManager);
router.put("/curriculum/pathway/manager", updatePathwayManager);
router.delete("/curriculum/pathway/manager", deletePathwayManager);

// end point for curriculum / class
router.get("/curriculum/classs", getClasses);
router.get("/curriculum/all-classs", getAllClasses);
router.post("/curriculum/class", createClass);
router.put("/curriculum/class", updateClass);
router.delete("/curriculum/class", deleteClass);

router.get("/curriculum/class/tutors", getClassTutors);
router.get("/curriculum/class/all-tutors", getAllClassTutors);
router.post("/curriculum/class/tutor", createClassTutor);
router.put("/curriculum/class/tutor", updateClassTutor);
router.delete("/curriculum/class/tutor", deleteClassTutor);

// end point for curriculum / basesubject
router.get("/curriculum/base-subjects", getBaseSubjects);
router.get("/curriculum/allbase-subjects", getAllBaseSubjects);
router.post("/curriculum/base-subject", createBaseSubject);
router.put("/curriculum/base-subject", updateBaseSubject);
router.delete("/curriculum/base-subject", deleteBaseSubject);

router.get("/curriculum/base-subject/managers", getBaseSubjectManagers);
router.post("/curriculum/base-subject/manager", createBaseSubjectManager);
router.put("/curriculum/base-subject/manager", updateBaseSubjectManager);
router.delete("/curriculum/base-subject/manager", deleteBaseSubjectManager);

// end point for curriculum / subjects
router.get("/curriculum/class-subjects", getClassSubjects);
router.get("/curriculum/all-class-subjects", getAllClassSubjects);
router.post("/curriculum/class-subject", createClassSubject);
router.put("/curriculum/class-subject", updateClassSubject);
router.delete("/curriculum/class-subject", deleteClassSubject);

router.get("/curriculum/class-subject/teachers", getClassSubjectTeachers);
router.get("/curriculum/class-subject/all-teachers", getAllClassSubjectTeachers);
router.post("/curriculum/class-subject/teacher", createClassSubjectTeacher);
router.put("/curriculum/class-subject/teacher", updateClassSubjectTeacher);
router.delete("/curriculum/class-subject/teacher", deleteClassSubjectTeacher);

// end point for curriculum / topics
router.get("/curriculum/topics", getTopics);
router.get("/curriculum/all-topics", getAllTopics);
router.post("/curriculum/topic", createTopic);
router.put("/curriculum/topic", updateTopic);
router.delete("/curriculum/topic", deleteTopic);

// end point for curriculum / syllabus
router.get("/curriculum/syllabuses", getSyllabuses);
router.get("/curriculum/all-yllabuses", getAllSyllabuses);
router.post("/curriculum/syllabus", createSyllabus);
router.put("/curriculum/syllabus", updateSyllabus);
router.delete("/curriculum/syllabus", deleteSyllabus);

export default router;
