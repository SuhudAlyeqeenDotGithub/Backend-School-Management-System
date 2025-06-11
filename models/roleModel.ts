import e from "express";
import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const roleSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "OrgAccount", required: true },
    roleName: { type: String, required: true, unique: true },
    roleDescription: { type: String },
    absoluteAdmin: { type: Boolean, default: false },
    tabAccess: {
      adminTab: {
        type: [String],
        enum: ["createRole", "editRole", "deleteRole", "viewRole", "createUser", "editUser", "deleteUser", "viewUsers"]
      },
      courseTab: {
        type: [String],
        enum: [
          "createCourse",
          "editCourse",
          "deleteCourse",
          "viewCourses",
          "createLevel",
          "editLevel",
          "deleteLevel",
          "viewLevels",
          "createSubject",
          "editSubject",
          "deleteSubject",
          "viewSubjects"
        ]
      },
      studentTab: {
        type: [String],
        enum: ["createStudent", "editStudent", "deleteStudent", "viewStudents"]
      },
      enrollmentTab: {
        type: [String],
        enum: ["createEnrollment", "editEnrollment", "deleteEnrollment", "viewEnrollments"]
      },
      attendanceTab: {
        type: [String],
        enum: ["createAttendance", "editAttendance", "deleteAttendance", "viewAttendance"]
      },
      staffTab: {
        type: [String],
        enum: [
          "createStaff",
          "editStaff",
          "deleteStaff",
          "viewStaff",
          "createStaffContract",
          "editStaffContract",
          "deleteStaffContract",
          "viewStaffContracts"
        ]
      },
      default: {}
    }
  },
  { timestamps: true }
);

export const Role = model("Role", roleSchema);

/* 
adminTabActions: [createRole, editRole, deleteRole, viewRole, createUser, editUser, deleteUser, viewUsers],
courseTabActions: [createCourse, editCourse, deleteCourse, viewCourses, createLevel, editLevel, deleteLevel, viewLevels, createSubject, editSubject, deleteSubject, viewSubjects],
studentTabActions: [createStudent, editStudent, deleteStudent, viewStudents],
erollmentTabActions: [createEnrollment, editEnrollment, deleteEnrollment, viewEnrollments],
attendanceTabActions: [createAttendance, editAttendance, deleteAttendance, viewAttendance],
staffTabActions: [createStaff, editStaff, deleteStaff, viewStaff, createStaffContract, editStaffContract, deleteStaffContract, viewStaffContracts],




*/
