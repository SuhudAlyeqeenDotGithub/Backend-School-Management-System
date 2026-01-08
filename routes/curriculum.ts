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
  deleteProgrammeManager,
  getAllProgrammeManagers
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
  getAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear
} from "../controllers/academicSessionControllers/academicYear";
import { createPeriod, updatePeriod, deletePeriod, getPeriods } from "../controllers/academicSessionControllers/period";

import {
  getBaseSubjectManagers,
  createBaseSubjectManager,
  updateBaseSubjectManager,
  deleteBaseSubjectManager,
  getAllBaseSubjectManagers
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
import { createStage, getStages, updateStage, deleteStage } from "../controllers/curriculum/stage/stage";
import {
  getRecentClassActivities,
  getRecentPathwayActivities,
  getRecentProgrammeActivities,
  getRecentSubjectActivities
} from "../controllers/curriculum/recentActivities";
import {
  getDayAttendanceRequiredCurriculum,
  getAllAuthorizedClassSubjects
} from "../controllers/curriculum/authorizedCurriculum";

// end point for curriculum / programme
router.get("/programmes", getProgrammes);
router.get("/all-programmes", getAllProgrammes);
router.post("/programme", createProgramme);
router.put("/programme", updateProgramme);
router.delete("/programme", deleteProgramme);
router.get("/programme/recent-activities", getRecentProgrammeActivities);
// end point for curriculum / programme manager

router.get("/programme/managers", getProgrammeManagers);
router.get("/programme/all-managers", getAllProgrammeManagers);
router.post("/programme/manager", createProgrammeManager);
router.put("/programme/manager", updateProgrammeManager);
router.delete("/programme/manager", deleteProgrammeManager);

// end point for curriculum / stage
router.get("/stages", getStages);
router.post("/stage", createStage);
router.put("/stage", updateStage);
router.delete("/stage", deleteStage);
router.get("/pathway/recent-activities", getRecentPathwayActivities);

// end point for curriculum / pathway
router.get("/pathways", getPathways);
router.get("/all-pathways", getAllPathways);
router.post("/pathway", createPathway);
router.put("/pathway", updatePathway);
router.delete("/pathway", deletePathway);

router.get("/pathway/managers", getPathwayManagers);
router.get("/pathway/all-managers", getAllPathwayManagers);
router.post("/pathway/manager", createPathwayManager);
router.put("/pathway/manager", updatePathwayManager);
router.delete("/pathway/manager", deletePathwayManager);

// end point for curriculum / class
router.get("/classes", getClasses);
router.get("/all-classes", getAllClasses);
router.post("/class", createClass);
router.put("/class", updateClass);
router.delete("/class", deleteClass);
router.get("/day-attendance/required-curriculum", getDayAttendanceRequiredCurriculum);
router.get("/class/recent-activities", getRecentClassActivities);

router.get("/class/tutors", getClassTutors);
router.get("/class/all-tutors", getAllClassTutors);
router.post("/class/tutor", createClassTutor);
router.put("/class/tutor", updateClassTutor);
router.delete("/class/tutor", deleteClassTutor);

// end point for curriculum / basesubject
router.get("/base-subjects", getBaseSubjects);
router.get("/all-base-subjects", getAllBaseSubjects);
router.post("/base-subject", createBaseSubject);
router.put("/base-subject", updateBaseSubject);
router.delete("/base-subject", deleteBaseSubject);
router.get("/all-class-subjects/authorized", getAllAuthorizedClassSubjects);

router.get("/base-subject/managers", getBaseSubjectManagers);
router.get("/base-subject/all-managers", getAllBaseSubjectManagers);
router.post("/base-subject/manager", createBaseSubjectManager);
router.put("/base-subject/manager", updateBaseSubjectManager);
router.delete("/base-subject/manager", deleteBaseSubjectManager);

// end point for curriculum / subjects
router.get("/class-subjects", getClassSubjects);
router.get("/all-class-subjects", getAllClassSubjects);
router.post("/class-subject", createClassSubject);
router.put("/class-subject", updateClassSubject);
router.delete("/class-subject", deleteClassSubject);

router.get("/class-subject/teachers", getClassSubjectTeachers);
router.get("/class-subject/all-teachers", getAllClassSubjectTeachers);
router.post("/class-subject/teacher", createClassSubjectTeacher);
router.put("/class-subject/teacher", updateClassSubjectTeacher);
router.delete("/class-subject/teacher", deleteClassSubjectTeacher);

router.get("/subjects/recent-activities", getRecentSubjectActivities);

// end point for curriculum / topics
router.get("/topics", getTopics);
router.get("/all-topics", getAllTopics);
router.post("/topic", createTopic);
router.put("/topic", updateTopic);
router.delete("/topic", deleteTopic);

// end point for curriculum / syllabus
router.get("/syllabuses", getSyllabuses);
router.get("/all-syllabuses", getAllSyllabuses);
router.post("/syllabus", createSyllabus);
router.put("/syllabus", updateSyllabus);
router.delete("/syllabus", deleteSyllabus);

router.get("/academic-session/academic-years", getAcademicYears);
router.post("/academic-session/academic-year", createAcademicYear);
router.put("/academic-session/academic-year", updateAcademicYear);
router.delete("/academic-session/academic-year", deleteAcademicYear);
router.get("/academic-session/periods", getPeriods);
router.post("/academic-session/period", createPeriod);
router.put("/academic-session/period", updatePeriod);
router.delete("/academic-session/period", deletePeriod);

export default router;
