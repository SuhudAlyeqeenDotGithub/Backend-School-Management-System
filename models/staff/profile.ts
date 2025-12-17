import { Programme } from "models/curriculum/programme";
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const staffSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    fullName: { type: String, required: true },
    dateOfBirth: { type: String, required: true },
    gender: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, unique: true, required: true, index: true },
    address: { type: String, required: true },
    postCode: { type: String },
    imageUrl: { type: String },
    imageLocalDestination: { type: String },
    maritalStatus: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String },
    nationality: { type: String, required: true },
    allergies: { type: String },
    nextOfKinName: { type: String, required: true },
    nextOfKinRelationship: { type: String, required: true },
    nextOfKinPhone: { type: String, required: true },
    nextOfKinEmail: { type: String, required: true },
    searchText: { type: String, required: true },
    skills: { type: [String] },
    identifications: {
      type: [{ _id: String, identificationType: String, value: String, issueDate: Date, expiryDate: Date }]
    },
    qualifications: {
      type: [
        {
          _id: String,
          name: String,
          programme: String,
          school: String,
          grade: String,
          startDate: String,
          endDate: String
        }
      ]
    },
    workExperiences: {
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

staffSchema.index({ organisationId: 1, customId: 1 }, { unique: true });

export const Staff = model("Staff", staffSchema);
