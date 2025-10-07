import express from "express";
const router = express.Router();

import {
  getStudentProfiles,
  createStudentProfile,
  updateStudentProfile,
  deleteStudentProfile,
  getAllStudentProfiles
} from "../controllers/studentControllers/studentProfile";

// import {
//   getStudentContracts,
//   createStudentContract,
//   updateStudentContract,
//   deleteStudentContract,
//   getAllStudentContracts
// } from "../controllers/studentControllers/contractController";

import {
  getStudentImageViewSignedUrl,
  getStudentImageUploadSignedUrl,
  deleteStudentImageInBucket
} from "../controllers/googleCloudStorage/studentSignedUrl";

// end point for student / profile
router.get("/student/profile", getStudentProfiles);
router.get("/student/allprofile", getAllStudentProfiles);
router.post("/student/profile", createStudentProfile);
router.put("/student/profile", updateStudentProfile);
router.delete("/student/profile", deleteStudentProfile);

// end point for student / contracts
// router.get("/student/contract", getStudentContracts);
// router.get("/student/allcontract", getAllStudentContracts);
// router.post("/student/contract", createStudentContract);
// router.put("/student/contract", updateStudentContract);
// router.delete("/student/contract", deleteStudentContract);

// request signed url
router.post("/studentimageuploadsignedurl", getStudentImageUploadSignedUrl);
router.post("/studentimageviewsignedurl", getStudentImageViewSignedUrl);
router.delete("/studentimage", deleteStudentImageInBucket);

export default router;
