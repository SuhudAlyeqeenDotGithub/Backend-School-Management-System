import { Student } from "../models/student/studentProfile";
import { sendEmailToOwner, throwError } from "./utilsFunctions";
import { StudentEnrollment } from "../models/student/enrollment";
import { StudentDayAttendanceStore, StudentDayAttendanceTemplate } from "../models/student/dayattendance";
import { StudentSubjectAttendanceStore, StudentSubjectAttendanceTemplate } from "../models/student/subjectAttendance";

export const removeFeatureRelatedData = async (feature: string, organisationId: string) => {
  if (feature === "Student Profile & Enrollment") {
    const deleteProfile = await Student.deleteMany({ organisationId });
    if (!deleteProfile) {
      await sendEmailToOwner(
        "Error deleting student profiles",
        `Error deleting student profiles for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student profiles", 500);
    }

    const deleteEnrollment = await StudentEnrollment.deleteMany({ organisationId });
    if (!deleteEnrollment) {
      await sendEmailToOwner(
        "Error deleting student enrollments",
        `Error deleting student enrollments for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student enrollments", 500);
    }
    return true;
  }
  if (feature === "Student Attendance") {
    // const deleteDayAttendanceTemplate = await StudentDayAttendanceTemplate.deleteMany({ organisationId });
    // if (!deleteDayAttendanceTemplate) {
    //   await sendEmailToOwner(
    //     "Error deleting student day attendance templates",
    //     `Error deleting student day attendance templates for organisation ID: ${organisationId}`
    //   );
    //   throwError("Error deleting student day attendance templates", 500);
    // }
    // const deleteDayAttendanceStore = await StudentDayAttendanceStore.deleteMany({ organisationId });
    // if (!deleteDayAttendanceStore) {
    //   await sendEmailToOwner(
    //     "Error deleting student day attendance stores",
    //     `Error deleting student day attendance stores for organisation ID: ${organisationId}`
    //   );
    //   throwError("Error deleting student day attendance stores", 500);
    // }

    const deleteSubjectAttendanceTemplate = await StudentSubjectAttendanceTemplate.deleteMany({ organisationId });
    if (!deleteSubjectAttendanceTemplate) {
      await sendEmailToOwner(
        "Error deleting student subject attendance templates",
        `Error deleting student subject attendance templates for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student subject attendance templates", 500);
    }

    const deleteSubjectAttendanceStore = await StudentSubjectAttendanceStore.deleteMany({ organisationId });
    if (!deleteSubjectAttendanceStore) {
      await sendEmailToOwner(
        "Error deleting student subject attendance stores",
        `Error deleting student subject attendance stores for organisation ID: ${organisationId}`
      );
      throwError("Error deleting student subject attendance stores", 500);
    }
    return true;
  }
  if (feature === "Student Assessments") {
    return true;
  }
};
