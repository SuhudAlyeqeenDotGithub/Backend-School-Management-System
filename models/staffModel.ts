import mongoose from "mongoose";
const { Schema, model } = mongoose;

const staffSchema = new Schema(
  {
    staffCustomId: { type: String },
    staffFirstName: { type: String, required: true },
    staffMiddleName: { type: String },
    staffLastName: { type: String, required: true },
    staffDateOfBirth: { type: String, required: true },
    staffGender: { type: String, required: true },
    staffPhone: { type: String, required: true },
    staffEmail: { type: String, unique: true, required: true, index: true },
    staffAddress: { type: String, required: true },
    staffPostCode: { type: String },
    staffImage: { type: String },
    staffMaritalStatus: { type: String, required: true },
    staffStartDate: { type: String, required: true },
    staffEndDate: { type: String },
    staffNationality: { type: String, required: true },
    staffAllergies: { type: String },
    staffNextOfKinName: { type: String, required: true },
    staffNextOfKinRelationship: { type: String, required: true },
    staffNextOfKinPhone: { type: String, required: true },
    staffNextOfKinEmail: { type: String, required: true },
    searchText: { type: String, required: true },
    staffQualification: {
      type: [{ qualificationName: String, schoolName: String, startDate: String, endDate: String }]
    }
  },
  { timestamps: true }
);

export const Staff = model("Staff", staffSchema);
