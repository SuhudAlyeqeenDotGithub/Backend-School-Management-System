import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const roleSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    roleName: { type: String, required: true },
    roleDescription: { type: String },
    absoluteAdmin: { type: Boolean, default: false },
    tabAccess: {
      type: [],
      default: []
    }
  },
  { timestamps: true }
);

roleSchema.pre("save", function (next) {
  if (this.absoluteAdmin === true) {
    const allTabActions = {
      Admin: [
        "Create Role",
        "Edit Role",
        "Delete Role",
        "View Roles",
        "Create User",
        "Edit User",
        "Delete User",
        "View Users",
        "View Activity Logs"
      ],
      Course: [
        "Create Course",
        "Edit Course",
        "Delete Course",
        "View Courses",
        "Create Level",
        "Edit Level",
        "Delete Level",
        "View Levels",
        "Create Subject",
        "Edit Subject",
        "Delete Subject",
        "View Subjects"
      ],
      Student: ["Create Student", "Edit Student", "Delete Student", "View Students"],
      Enrollment: ["Create Enrollment", "Edit Enrollment", "Delete Enrollment", "View Enrollments"],
      Attendance: ["Create Attendance", "Edit Attendance", "Delete Attendance", "View Attendances"],
      Staff: [
        "Create Staff",
        "Edit Staff",
        "Delete Staff",
        "View Staff",
        "Create Staff Contract",
        "Edit Staff Contract",
        "Delete Staff Contract",
        "View Staff Contracts"
      ],
      Timeline: ["Create Academic Year", "Edit Academic Year", "Delete Academic Year", "View Academic Years"]
    };

    this.tabAccess = Object.entries(allTabActions).map(([tab, actions]) => ({
      tab,
      actions: actions.map((name) => ({ name, permission: true }))
    }));
  }

  next();
});

export const Role = model("Role", roleSchema);

