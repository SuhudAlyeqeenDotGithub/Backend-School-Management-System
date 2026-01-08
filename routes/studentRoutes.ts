import express from "express";
const router = express.Router();

import {
  getStudentProfiles,
  createStudentProfile,
  updateStudentProfile,
  deleteStudentProfile,
  getAllStudentProfiles
} from "../controllers/studentControllers/studentProfile";

import {
  getStudentEnrollments,
  createStudentEnrollment,
  updateStudentEnrollment,
  deleteStudentEnrollment,
  getAllStudentEnrollments
} from "../controllers/studentControllers/enrollment";

import {
  getStudentImageViewSignedUrl,
  getStudentImageUploadSignedUrl,
  deleteStudentImageInBucket
} from "../controllers/googleCloudStorage/studentSignedUrl";

// end point for student / profile
router.get("/student/profiles", getStudentProfiles);
router.get("/student/all-profiles", getAllStudentProfiles);
router.post("/student/profile", createStudentProfile);
router.put("/student/profile", updateStudentProfile);
router.delete("/student/profile", deleteStudentProfile);

// end point for student / contracts
router.get("/student/enrollments", getStudentEnrollments);
router.get("/student/all-enrollments", getAllStudentEnrollments);
router.post("/student/enrollment", createStudentEnrollment);
router.put("/student/enrollment", updateStudentEnrollment);
router.delete("/student/enrollment", deleteStudentEnrollment);

// request signed url
router.post("/studentimageuploadsignedurl", getStudentImageUploadSignedUrl);
router.post("/studentimageviewsignedurl", getStudentImageViewSignedUrl);
router.delete("/studentimage", deleteStudentImageInBucket);

import {
  createStudentDayAttendanceTemplate,
  deleteStudentDayAttendanceTemplate,
  // fetchStudentDayAttendances,
  getEnrolledDayAttendanceStudents,
  getStudentDayAttendanceTemplates,
  updateStudentDayAttendanceTemplate
} from "../controllers/studentControllers/dayAttendance";

// end point for student / day attendance
router.post("/student/attendance/enrolled-day-attendance-students", getEnrolledDayAttendanceStudents);
router.get("/student/attendance/day/templates", getStudentDayAttendanceTemplates);
router.post("/student/attendance/day/template", createStudentDayAttendanceTemplate);
router.put("/student/attendance/day/template", updateStudentDayAttendanceTemplate);
router.delete("/student/attendance/day/template", deleteStudentDayAttendanceTemplate);

import {
  createStudentSubjectAttendanceTemplate,
  deleteStudentSubjectAttendanceTemplate,
  // fetchStudentSubjectAttendances,
  getEnrolledSubjectAttendanceStudents,
  getStudentSubjectAttendanceTemplates,
  updateStudentSubjectAttendanceTemplate
} from "../controllers/studentControllers/subjectAttendance";

// end point for student / subject attendance
router.post("/student/attendance/enrolled-subject-attendance-students", getEnrolledSubjectAttendanceStudents);
router.get("/student/attendance/subject/templates", getStudentSubjectAttendanceTemplates);
router.post("/student/attendance/subject/template", createStudentSubjectAttendanceTemplate);
router.put("/student/attendance/subject/template", updateStudentSubjectAttendanceTemplate);
router.delete("/student/attendance/subject/template", deleteStudentSubjectAttendanceTemplate);
// router.post("/student/attendance/subject", fetchStudentDayAttendances);

export default router;
