import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const roleSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "OrgAccount", required: true },
    roleName: { type: String, required: true },
    roleDescription: { type: String },
    absoluteAdmin: { type: Boolean, default: false },
    tabAccess: {
      Admin: {
        type: [String],
        enum: [
          "createRole",
          "editRole",
          "deleteRole",
          "viewRole",
          "createUser",
          "editUser",
          "deleteUser",
          "viewUsers",
          "ViewActivityLog"
        ]
      },
      Course: {
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
      Student: {
        type: [String],
        enum: ["createStudent", "editStudent", "deleteStudent", "viewStudents"]
      },
      Enrollment: {
        type: [String],
        enum: ["createEnrollment", "editEnrollment", "deleteEnrollment", "viewEnrollments"]
      },
      Attendance: {
        type: [String],
        enum: ["createAttendance", "editAttendance", "deleteAttendance", "viewAttendance"]
      },
      Staff: {
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
