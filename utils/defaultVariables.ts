export const defaultTabAccess = [
  {
    group: "Administration",
    tabs: [
      {
        group: "Administration",
        tab: "Roles & Permission",
        actions: [
          { action: "Create Role", permission: true },
          { action: "View Roles", permission: true },
          { action: "Edit Role", permission: true },
          { action: "Delete Role", permission: true }
        ]
      },
      {
        group: "Administration",
        tab: "Users",
        actions: [
          { action: "Create User", permission: true },
          { action: "View Users", permission: true },
          { action: "Edit User", permission: true },
          { action: "Delete User", permission: true }
        ]
      },
      {
        group: "Administration",
        tab: "Activity Log",
        actions: [
          { action: "Create Activity Log", permission: true },
          { action: "View Activity Logs", permission: true },
          { action: "Edit Activity Log", permission: true },
          { action: "Delete Activity Log", permission: true }
        ]
      },
      {
        group: "Administration",
        tab: "Billing",
        actions: [
          { action: "Create Billing", permission: true },
          { action: "View Billings", permission: true },
          { action: "Edit Billing", permission: true },
          { action: "Delete Billing", permission: true },
          { action: "Update Subscription", permission: true },
          { action: "View Subscriptions", permission: true },
          { action: "Update Failed Payments", permission: true },
          { action: "View Failed Payments", permission: true }
        ]
      },
      {
        group: "Administration",
        tab: "Setting",
        actions: [
          { action: "Update Settings", permission: true },
          { action: "Edit Organisation Profile", permission: true }
        ]
      }
    ]
  },
  {
    group: "Curriculum",
    tabs: [
      {
        group: "Curriculum",
        tab: "Programme",
        actions: [
          { action: "Create Programme", permission: true },
          { action: "View Programmes", permission: true },
          { action: "Edit Programme", permission: true },
          { action: "Delete Programme", permission: true },
          { action: "Create Programme Manager", permission: true },
          { action: "View Programme Managers", permission: true },
          { action: "Edit Programme Manager", permission: true },
          { action: "Delete Programme Manager", permission: true }
        ]
      },
      {
        group: "Curriculum",
        tab: "Course",
        actions: [
          { action: "Create Course", permission: true },
          { action: "View Courses", permission: true },
          { action: "Edit Course", permission: true },
          { action: "Delete Course", permission: true },
          { action: "Create Base Course", permission: true },
          { action: "View Base Courses", permission: true },
          { action: "Edit Base Course", permission: true },
          { action: "Delete Base Course", permission: true },
          { action: "Create Course Manager", permission: true },
          { action: "View Course Managers", permission: true },
          { action: "Edit Course Manager", permission: true },
          { action: "Delete Course Manager", permission: true }
        ]
      },
      {
        group: "Curriculum",
        tab: "Level",
        actions: [
          { action: "Create Level", permission: true },
          { action: "View Levels", permission: true },
          { action: "Edit Level", permission: true },
          { action: "Delete Level", permission: true },
          { action: "Create Level Manager", permission: true },
          { action: "View Level Managers", permission: true },
          { action: "Edit Level Manager", permission: true },
          { action: "Delete Level Manager", permission: true }
        ]
      },
      {
        group: "Curriculum",
        tab: "Subject",
        actions: [
          { action: "Create Base Subject", permission: true },
          { action: "View Base Subjects", permission: true },
          { action: "Edit Base Subject", permission: true },
          { action: "Delete Base Subject", permission: true },
          { action: "Create Subject", permission: true },
          { action: "View Subjects", permission: true },
          { action: "Edit Subject", permission: true },
          { action: "Delete Subject", permission: true },
          { action: "Create Subject Manager", permission: true },
          { action: "View Subject Managers", permission: true },
          { action: "Edit Subject Manager", permission: true },
          { action: "Delete Subject Manager", permission: true }
        ]
      },
      {
        group: "Curriculum",
        tab: "Learning Plan",
        actions: [
          { action: "Create Syllabus", permission: true },
          { action: "View Syllabus", permission: true },
          { action: "Edit Syllabus", permission: true },
          { action: "Delete Syllabus", permission: true },
          { action: "Create Topic", permission: true },
          { action: "View Topics", permission: true },
          { action: "Edit Topic", permission: true },
          { action: "Delete Topic", permission: true },
          { action: "Create Timetable", permission: true },
          { action: "View Timetables", permission: true },
          { action: "Edit Timetable", permission: true },
          { action: "Delete Timetable", permission: true }
        ]
      },
      {
        group: "Curriculum",
        tab: "Academic Session",
        actions: [
          { action: "Create Academic Year", permission: true },
          { action: "View Academic Years", permission: true },
          { action: "Edit Academic Year", permission: true },
          { action: "Delete Academic Year", permission: true },
          { action: "Create Period", permission: true },
          { action: "View Periods", permission: true },
          { action: "Edit Period", permission: true },
          { action: "Delete Period", permission: true }
        ]
      },
      {
        group: "Curriculum",
        tab: "Location",
        actions: [
          { action: "Create Location", permission: true },
          { action: "View Locations", permission: true },
          { action: "Edit Location", permission: true },
          { action: "Delete Location", permission: true }
        ]
      }
    ]
  },
  {
    group: "Staff",
    tabs: [
      {
        group: "Staff",
        tab: "Staff Profile",
        actions: [
          { action: "View Staff Profiles", permission: true },
          { action: "Create Staff Profile", permission: true },
          { action: "Edit Staff Profile", permission: true },
          { action: "Delete Staff Profile", permission: true }
        ]
      },
      {
        group: "Staff",
        tab: "Staff Contract",
        actions: [
          { action: "Create Staff Contract", permission: true },
          { action: "View Staff Contract", permission: true },
          { action: "Edit Staff Contract", permission: true },
          { action: "Delete Staff Contract", permission: true }
        ]
      }
    ]
  },
  {
    group: "Attendance",
    tabs: [
      {
        group: "Attendance",
        tab: "Per Subject Attendance",
        actions: [
          { action: "Create Subject Attendance", permission: true },
          { action: "View Subject Attendances", permission: true },
          { action: "Edit Subject Attendance", permission: true },
          { action: "Delete Subject Attendance", permission: true }
        ]
      },
      {
        group: "Attendance",
        tab: "Per Day Attendance",
        actions: [
          { action: "Create Day Attendance", permission: true },
          { action: "View Day Attendances", permission: true },
          { action: "Edit Day Attendance", permission: true },
          { action: "Delete Day Attendance", permission: true }
        ]
      },
      {
        group: "Attendance",
        tab: "Event Attendance",
        actions: [
          { action: "Create Event Attendance", permission: true },
          { action: "View Event Attendances", permission: true },
          { action: "Edit Event Attendance", permission: true },
          { action: "Delete Event Attendance", permission: true }
        ]
      }
    ]
  }
];
