import { Student } from "../models/student/studentProfile";
import { sendEmailToOwner } from "./databaseFunctions";
import { StudentEnrollment } from "../models/student/enrollment";
import { StudentDayAttendance, StudentDayAttendanceTemplate } from "../models/student/dayattendance";
import { StudentSubjectAttendance, StudentSubjectAttendanceTemplate } from "../models/student/subjectAttendance";
import { throwError } from "./pureFuctions";
import { Request } from "express";

export const removeFeatureRelatedData = async (req: Request, feature: string, organisationId: string) => {
  // delete profile and enrollment data
  if (feature === "Student Profile & Enrollment") {
    const deleteProfile = await Student.deleteMany({ organisationId });
    if (!deleteProfile) {
      await sendEmailToOwner(
        req,
        "Error deleting student profiles",
        `Error deleting student profiles for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student profiles", 500);
    }

    const deleteEnrollment = await StudentEnrollment.deleteMany({ organisationId });
    if (!deleteEnrollment) {
      await sendEmailToOwner(
        req,
        "Error deleting student enrollments",
        `Error deleting student enrollments for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student enrollments", 500);
    }
    return deleteProfile.deletedCount + deleteEnrollment.deletedCount;
  }

  // delete attendance data
  if (feature === "Student Attendance") {
    const deleteDayAttendanceTemplate = await StudentDayAttendanceTemplate.deleteMany({ organisationId });
    if (!deleteDayAttendanceTemplate) {
      await sendEmailToOwner(
        req,
        "Error deleting student day attendance templates",
        `Error deleting student day attendance templates for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student day attendance templates", 500);
    }
    const deleteDayAttendanceStore = await StudentDayAttendance.deleteMany({ organisationId });
    if (!deleteDayAttendanceStore) {
      await sendEmailToOwner(
        req,
        "Error deleting student day attendance stores",
        `Error deleting student day attendance stores for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student day attendance stores", 500);
    }

    // delete subject attendance
    const deleteSubjectAttendanceTemplate = await StudentSubjectAttendanceTemplate.deleteMany({ organisationId });
    if (!deleteSubjectAttendanceTemplate) {
      await sendEmailToOwner(
        req,
        "Error deleting student subject attendance templates",
        `Error deleting student subject attendance templates for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student subject attendance templates", 500);
    }

    const deleteSubjectAttendanceStore = await StudentSubjectAttendance.deleteMany({ organisationId });
    if (!deleteSubjectAttendanceStore) {
      await sendEmailToOwner(
        req,
        "Error deleting student subject attendance stores",
        `Error deleting student subject attendance stores for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student subject attendance stores", 500);
    }

    return deleteSubjectAttendanceTemplate.deletedCount + deleteSubjectAttendanceStore.deletedCount;
  }
  if (feature === "Student Assessments") {
    return 0;
  }
};
