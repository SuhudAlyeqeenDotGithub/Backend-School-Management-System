import mongoose from "mongoose";
const { Schema, model } = mongoose;

const staffSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    staffCustomId: { type: String, unique: true },
    staffFullName: { type: String, required: true },
    staffDateOfBirth: { type: String, required: true },
    staffGender: { type: String, required: true },
    staffPhone: { type: String, required: true },
    staffEmail: { type: String, unique: true, required: true, index: true },
    staffAddress: { type: String, required: true },
    staffPostCode: { type: String },
    staffImage: { type: String },
    staffImageDestination: { type: String },
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
    skills: { type: [String] },
    identification: {
      type: [
        {
          idType: String,
          idNumber: String,
          issueDate: Date,
          expiryDate: Date
        }
      ]
    },
    staffQualification: {
      type: [{ _id: String, qualificationName: String, schoolName: String, startDate: String, endDate: String }]
    },
    workExperience: {
      type: [
        {
          _id: String,
          organisation: String,
          position: String,
          experience: String,
          startDate: Date,
          endDate: Date
        }
      ]
    }
  },
  { timestamps: true }
);

staffSchema.index({ organisationId: 1 });
staffSchema.index({ organisationId: 1, staffCustomId: 1 }, { unique: true });
staffSchema.index({ staffMaritalStatus: 1 });
staffSchema.index({ staffGender: 1 });
staffSchema.index({ searchText: 1 });

export const Staff = model("Staff", staffSchema);
