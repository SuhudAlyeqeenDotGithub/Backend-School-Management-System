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
import {
  createStudentDayAttendance,
  deleteStudentDayAttendance,
  fetchDayAttendanceStore,
  getEnrolledDayAttendanceStudents,
  getStudentDayAttendances,
  updateStudentDayAttendance
} from "../controllers/studentControllers/dayAttendance";

// end point for student / profile
router.get("/student/profile", getStudentProfiles);
router.get("/student/allprofile", getAllStudentProfiles);
router.post("/student/profile", createStudentProfile);
router.put("/student/profile", updateStudentProfile);
router.delete("/student/profile", deleteStudentProfile);

// end point for student / contracts
router.get("/student/enrollment", getStudentEnrollments);
router.get("/student/allenrollment", getAllStudentEnrollments);
router.post("/student/enrollment", createStudentEnrollment);
router.put("/student/enrollment", updateStudentEnrollment);
router.delete("/student/enrollment", deleteStudentEnrollment);

// request signed url
router.post("/studentimageuploadsignedurl", getStudentImageUploadSignedUrl);
router.post("/studentimageviewsignedurl", getStudentImageViewSignedUrl);
router.delete("/studentimage", deleteStudentImageInBucket);

// end point for student / day attendance
router.post("/student/attendance/enrolleddayattendancestudents", getEnrolledDayAttendanceStudents);
router.get("/student/attendance/dayattendance", getStudentDayAttendances);
router.post("/student/attendance/dayattendance", createStudentDayAttendance);
router.put("/student/attendance/dayattendance", updateStudentDayAttendance);
router.delete("/student/attendance/dayattendance", deleteStudentDayAttendance);
router.post("/student/attendance/dayattendancestore", fetchDayAttendanceStore);

export default router;
