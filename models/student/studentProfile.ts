import { getEmailVerificationCode } from "controllers/accountControllers";
import mongoose, { Schema, model } from "mongoose";

const studentSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    customId: { type: String, unique: true },
    fullName: { type: String, required: true },
    dateOfBirth: { type: String, required: true },
    gender: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, index: true },
    address: { type: String, required: true },
    postCode: { type: String },
    imageUrl: { type: String },
    imageLocalDestination: { type: String },
    startDate: { type: String, required: true },
    endDate: { type: String },
    nationality: { type: String, required: true },
    allergies: { type: String },
    nextOfKinName: { type: String, required: true },
    nextOfKinRelationship: { type: String, required: true },
    nextOfKinPhone: { type: String, required: true },
    nextOfKinEmail: { type: String, required: true },
    searchText: { type: String, required: true },
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
    }
  },
  { timestamps: true }
);

studentSchema.index({ organisationId: 1, customId: 1 }, { unique: true });
studentSchema.index({ organisationId: 1, email: 1 });

export const Student = model("Student", studentSchema);
