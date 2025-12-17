export const defaultTabAccess = [
  // Administration
  {
    tab: "Roles & Permission",
    group: "Administration",
    actions: [
      { action: "Create Role", permission: true },
      { action: "View Roles", permission: true },
      { action: "Edit Role", permission: true },
      { action: "Delete Role", permission: true }
    ]
  },
  {
    tab: "Users",
    group: "Administration",
    actions: [
      { action: "Create User", permission: true },
      { action: "View Users", permission: true },
      { action: "Edit User", permission: true },
      { action: "Delete User", permission: true }
    ]
  },
  {
    tab: "Features",
    group: "Administration",
    actions: [{ action: "Update Features", permission: true }]
  },
  {
    tab: "Activity Log",
    group: "Administration",
    actions: [
      { action: "Create Activity Log", permission: true },
      { action: "View Activity Logs", permission: true },
      { action: "Edit Activity Log", permission: true },
      { action: "Delete Activity Log", permission: true }
    ]
  },
  {
    tab: "Billing",
    group: "Administration",
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
    tab: "Setting",
    group: "Administration",
    actions: [
      { action: "Update Settings", permission: true },
      { action: "Edit Organisation Profile", permission: true }
    ]
  },

  // Curriculum
  {
    tab: "Stage",
    group: "Curriculum",
    actions: [
      { action: "Create Stage", permission: true },
      { action: "View Stages", permission: true },
      { action: "Edit Stage", permission: true },
      { action: "Delete Stage", permission: true }
    ]
  },
  {
    tab: "Programme",
    group: "Curriculum",
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
    tab: "Pathway",
    group: "Curriculum",
    actions: [
      { action: "Create Pathway", permission: true },
      { action: "View Pathways", permission: true },
      { action: "Edit Pathway", permission: true },
      { action: "Delete Pathway", permission: true },
      { action: "Create Pathway Manager", permission: true },
      { action: "View Pathway Managers", permission: true },
      { action: "Edit Pathway Manager", permission: true },
      { action: "Delete Pathway Manager", permission: true }
    ]
  },
  {
    tab: "Qualification",
    group: "Curriculum",
    actions: [
      { action: "Create Qualification", permission: true },
      { action: "View Qualifications", permission: true },
      { action: "Edit Qualification", permission: true },
      { action: "Delete Qualification", permission: true }
    ]
  },
  {
    tab: "Class",
    group: "Curriculum",
    actions: [
      { action: "Create Class", permission: true },
      { action: "View Classes", permission: true },
      { action: "Edit Class", permission: true },
      { action: "Delete Class", permission: true },
      { action: "Create Class Tutor", permission: true },
      { action: "View Class Tutors", permission: true },
      { action: "Edit Class Tutor", permission: true },
      { action: "Delete Class Tutor", permission: true }
    ]
  },
  {
    tab: "Subject",
    group: "Curriculum",
    actions: [
      { action: "Create Base Subject", permission: true },
      { action: "View Base Subjects", permission: true },
      { action: "Edit Base Subject", permission: true },
      { action: "Delete Base Subject", permission: true },
      { action: "Create Base Subject Manager", permission: true },
      { action: "View Base Subject Managers", permission: true },
      { action: "Edit Base Subject Manager", permission: true },
      { action: "Delete Base Subject Manager", permission: true },
      { action: "Create Class Subject", permission: true },
      { action: "View Class Subjects", permission: true },
      { action: "Edit Class Subject", permission: true },
      { action: "Delete Class Subject", permission: true },
      { action: "Create Class Subject Teacher", permission: true },
      { action: "View Class Subject Teachers", permission: true },
      { action: "Edit Class Subject Teacher", permission: true },
      { action: "Delete Class Subject Teacher", permission: true }
    ]
  },
  {
    tab: "Event",
    group: "Curriculum",
    actions: [
      { action: "Create Event", permission: true },
      { action: "View Events", permission: true },
      { action: "Edit Event", permission: true },
      { action: "Delete Event", permission: true },
      { action: "Create Event Manager", permission: true },
      { action: "View Event Managers", permission: true },
      { action: "Edit Event Manager", permission: true },
      { action: "Delete Event Manager", permission: true }
    ]
  },
  {
    tab: "Learning Plan",
    group: "Curriculum",
    actions: [
      { action: "Create Syllabus", permission: true },
      { action: "View Syllabuses", permission: true },
      { action: "Edit Syllabus", permission: true },
      { action: "Delete Syllabus", permission: true },
      { action: "Create Scheme of Work", permission: true },
      { action: "View Scheme of Works", permission: true },
      { action: "Edit Scheme of Work", permission: true },
      { action: "Delete Scheme of Work", permission: true },
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
    tab: "Academic Session",
    group: "Curriculum",
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
    tab: "Location",
    group: "Curriculum",
    actions: [
      { action: "Create Location", permission: true },
      { action: "View Locations", permission: true },
      { action: "Edit Location", permission: true },
      { action: "Delete Location", permission: true }
    ]
  },

  // Staff
  {
    tab: "Staff Profile",
    group: "Staff",
    actions: [
      {
        action: "Create Staff Profile",
        permission: true
      },
      {
        action: "View Staff Profiles",
        permission: true
      },
      {
        action: "Edit Staff Profile",
        permission: true
      },
      {
        action: "Delete Staff Profile",
        permission: true
      }
    ]
  },
  {
    tab: "Staff Contract",
    group: "Staff",
    actions: [
      { action: "Create Staff Contract", permission: true },
      { action: "View Staff Contracts", permission: true },
      { action: "Edit Staff Contract", permission: true },
      { action: "Delete Staff Contract", permission: true }
    ]
  },

  // students
  {
    tab: "Student Profile",
    group: "Student",
    actions: [
      {
        action: "Create Student Profile",
        permission: true
      },
      {
        action: "View Student Profiles",
        permission: true
      },
      {
        action: "Edit Student Profile",
        permission: true
      },
      {
        action: "Delete Student Profile",
        permission: true
      }
    ]
  },
  {
    tab: "Student Enrollment",
    group: "Student",
    actions: [
      { action: "Create Student Enrollment", permission: true },
      { action: "View Student Enrollment", permission: true },
      { action: "Edit Student Enrollment", permission: true },
      { action: "Delete Student Enrollment", permission: true }
    ]
  },
  {
    tab: "Student Attendance",
    group: "Student",
    actions: [
      { action: "View Student Day Attendances (Admin Access)", permission: true },
      { action: "View Student Day Attendances (For Class | Pathway Managers)", permission: true },

      { action: "Create Student Day Attendance (Admin Access)", permission: true },
      { action: "Create Student Day Attendance (For Class | Pathway Managers)", permission: true },

      { action: "Edit Student Day Attendance (Admin Access)", permission: true },
      { action: "Edit Student Day Attendance (For Class | Pathway Managers)", permission: true },

      { action: "Delete Student Day Attendance (Admin Access)", permission: true },
      { action: "Delete Student Day Attendance (For Class | Pathway Managers)", permission: true },

      { action: "View Student Event Attendances (Admin Access)", permission: true },
      { action: "View Student Event Attendances (For Class | Pathway Managers)", permission: true },

      { action: "Create Student Event Attendance (Admin Access)", permission: true },
      { action: "Create Student Event Attendance (For Class | Pathway Managers)", permission: true },

      { action: "Edit Student Event Attendance (Admin Access)", permission: true },
      { action: "Edit Student Event Attendance (For Class | Pathway Managers)", permission: true },

      { action: "Delete Student Event Attendance (Admin Access)", permission: true },
      { action: "Delete Student Event Attendance (For Class | Pathway Managers)", permission: true },

      { action: "View Student Subject Attendances (Admin Access)", permission: true },
      {
        action: "View Student Subject Attendances (For Class | Pathway Managers | Subject Teachers)",
        permission: true
      },

      { action: "Create Student Subject Attendance (Admin Access)", permission: true },
      {
        action: "Create Student Subject Attendance (For Class | Pathway Managers | Subject Teachers)",
        permission: true
      },

      { action: "Edit Student Subject Attendance (Admin Access)", permission: true },
      { action: "Edit Student Subject Attendance (For Class | Pathway Managers | Subject Teachers)", permission: true },

      { action: "Delete Student Subject Attendance (Admin Access)", permission: true },
      {
        action: "Delete Student Subject Attendance (For Class | Pathway Managers | Subject Teachers)",
        permission: true
      }
    ]
  }
];
