import mongoose from "mongoose";
import { logActivity } from "utils/utilsFunctions";
const { Schema, model } = mongoose;

const accountSchema = new Schema(
  {
    accountType: { type: String, enum: ["Organization", "User", "Owner"], required: true },
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    organisationInitial: { type: String, required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    accountName: { type: String },
    accountEmail: { type: String, unique: true, required: true, index: true },
    accountPassword: { type: String, required: true },
    accountPhone: { type: String },
    settings: { type: Schema.Types.Mixed, default: {}, required: true },
    accountStatus: { type: String, required: true, default: "Active", enum: ["Active", "Locked"] },
    searchText: { type: String, required: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    uniqueTabAccess: { type: [mongoose.Schema.Types.ObjectId], ref: "Role", default: [] }
  },
  { timestamps: true }
);

accountSchema.pre("validate", function (next) {
  if (!this.organisationId) {
    this.organisationId = this._id; // Mongoose auto-generates _id
  }
  next();
});
export const Account = model("Account", accountSchema);

export const defaultSettings = {
  logActivity: true
};

// uniqueTabAccess = [{tab: "Admin", actions:[{name: "Create Role", permission: false}]}]

/*tabAccess: {
"Curriculum": {hasAccess: boolean, tabs: {"Course": {hasAccess: boolean, actions: [{name: "Create Course", permission: false}]}}}

}*/

const tabAccess = [
  {
    group: "Administration",
    hasAccess: false,
    tabs: [
      {
        tab: "Roles & Permissions",
        hasAccess: false,
        actions: [
          { action: "Create Role", permission: false },
          { action: "View Roles", permission: false },
          { action: "Edit Role", permission: false },
          { action: "Delete Role", permission: false }
        ]
      },
      {
        tab: "Users",
        hasAccess: false,
        actions: [
          { action: "Create User", permission: false },
          { action: "View Users", permission: false },
          { action: "Edit User", permission: false },
          { action: "Delete User", permission: false }
        ]
      },
      {
        tab: "Activity Log",
        hasAccess: false,
        actions: [
          { action: "Create Activity Log", permission: false },
          { action: "View Activity Logs", permission: false },
          { action: "Edit Activity Log", permission: false },
          { action: "Delete Activity Log", permission: false }
        ]
      },
      {
        tab: "Billing",
        hasAccess: false,
        actions: [
          { action: "Create Billing", permission: false },
          { action: "View Billings", permission: false },
          { action: "Edit Billing", permission: false },
          { action: "Delete Billing", permission: false },
          { action: "Update Subscription", permission: false },
          { action: "View Subscriptions", permission: false },
          { action: "Update Failed Payments", permission: false },
          { action: "View Failed Payments", permission: false }
        ]
      },
      {
        tab: "Settings",
        hasAccess: false,
        actions: [
          { action: "Update Settings", permission: false },
          { action: "Edit Organisation Profile", permission: false }
        ]
      }
    ]
  },
  {
    group: "Attendance",
    hasAccess: false,
    tabs: [
      {
        tab: "Per Subject Attendance",
        hasAccess: false,
        actions: [
          { action: "Create Subject Attendance", permission: false },
          { action: "View Subject Attendances", permission: false },
          { action: "Edit Subject Attendance", permission: false },
          { action: "Delete Subject Attendance", permission: false }
        ]
      },
      {
        tab: "Per Day Attendance",
        hasAccess: false,
        actions: [
          { action: "Create Day Attendance", permission: false },
          { action: "View Day Attendances", permission: false },
          { action: "Edit Day Attendance", permission: false },
          { action: "Delete Day Attendance", permission: false }
        ]
      },
      {
        tab: "Event Attendance",
        hasAccess: false,
        actions: [
          { action: "Create Event Attendance", permission: false },
          { action: "View Event Attendances", permission: false },
          { action: "Edit Event Attendance", permission: false },
          { action: "Delete Event Attendance", permission: false }
        ]
      }
    ]
  },
  {
    group: "Curriculum",
    hasAccess: false,
    tabs: [
      {
        tab: "Programme",
        hasAccess: false,
        actions: [
          { action: "Create Programme", permission: false },
          { action: "View Programmes", permission: false },
          { action: "Edit Programme", permission: false },
          { action: "Delete Programme", permission: false },
          { action: "Create Programme Manager", permission: false },
          { action: "View Programme Managers", permission: false },
          { action: "Edit Programme Manager", permission: false },
          { action: "Delete Programme Manager", permission: false }
        ]
      },
      {
        tab: "Course",
        hasAccess: false,
        actions: [
          { action: "Create Course", permission: false },
          { action: "View Courses", permission: false },
          { action: "Edit Course", permission: false },
          { action: "Delete Course", permission: false },
          { action: "Create Base Course", permission: false },
          { action: "View Base Courses", permission: false },
          { action: "Edit Base Course", permission: false },
          { action: "Delete Base Course", permission: false },
          { action: "Create Course Manager", permission: false },
          { action: "View Course Managers", permission: false },
          { action: "Edit Course Manager", permission: false },
          { action: "Delete Course Manager", permission: false }
        ]
      },
      {
        tab: "Level",
        hasAccess: false,
        actions: [
          { action: "Create Level", permission: false },
          { action: "View Levels", permission: false },
          { action: "Edit Level", permission: false },
          { action: "Delete Level", permission: false },
          { action: "Create Level Manager", permission: false },
          { action: "View Level Managers", permission: false },
          { action: "Edit Level Manager", permission: false },
          { action: "Delete Level Manager", permission: false }
        ]
      },
      {
        tab: "Subject",
        hasAccess: false,
        actions: [
          { action: "Create Base Subject", permission: false },
          { action: "View Base Subjects", permission: false },
          { action: "Edit Base Subject", permission: false },
          { action: "Delete Base Subject", permission: false },
          { action: "Create Subject", permission: false },
          { action: "View Subjects", permission: false },
          { action: "Edit Subject", permission: false },
          { action: "Delete Subject", permission: false },
          { action: "Create Subject Manager", permission: false },
          { action: "View Subject Managers", permission: false },
          { action: "Edit Subject Manager", permission: false },
          { action: "Delete Subject Manager", permission: false }
        ]
      },
      {
        tab: "Learning Plan",
        hasAccess: false,
        actions: [
          { action: "Create Syllabus", permission: false },
          { action: "View Syllabus", permission: false },
          { action: "Edit Syllabus", permission: false },
          { action: "Delete Syllabus", permission: false },
          { action: "Create Topic", permission: false },
          { action: "View Topics", permission: false },
          { action: "Edit Topic", permission: false },
          { action: "Delete Topic", permission: false },
          { action: "Create Timetable", permission: false },
          { action: "View Timetables", permission: false },
          { action: "Edit Timetable", permission: false },
          { action: "Delete Timetable", permission: false }
        ]
      },
      {
        tab: "Academic Session",
        hasAccess: false,
        actions: [
          { action: "Create Academic Year", permission: false },
          { action: "View Academic Years", permission: false },
          { action: "Edit Academic Year", permission: false },
          { action: "Delete Academic Year", permission: false },
          { action: "Create Period", permission: false },
          { action: "View Periods", permission: false },
          { action: "Edit Period", permission: false },
          { action: "Delete Period", permission: false }
        ]
      },
      {
        tab: "Location",
        hasAccess: false,
        actions: [
          { action: "Create Location", permission: false },
          { action: "View Locations", permission: false },
          { action: "Edit Location", permission: false },
          { action: "Delete Location", permission: false }
        ]
      }
    ]
  }
];

/* tabObject.map((group) => {
 const { tab, actions } = group;
 return (<div id={group} onClick={() => handleTabClick(tab)}>
     {group}
 </div>)
});
*/
