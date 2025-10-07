import mongoose from "mongoose";
const { Schema, model } = mongoose;

const studentSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    studentCustomId: { type: String, unique: true },
    studentFullName: { type: String, required: true },
    studentDateOfBirth: { type: String, required: true },
    studentGender: { type: String, required: true },
    studentPhone: { type: String, required: true },
    studentEmail: { type: String, unique: true, required: true, index: true },
    studentAddress: { type: String, required: true },
    studentPostCode: { type: String },
    studentImageUrl: { type: String },
    imageLocalDestination: { type: String },
    studentStartDate: { type: String, required: true },
    studentEndDate: { type: String },
    studentNationality: { type: String, required: true },
    studentAllergies: { type: String },
    studentNextOfKinName: { type: String, required: true },
    studentNextOfKinRelationship: { type: String, required: true },
    studentNextOfKinPhone: { type: String, required: true },
    studentNextOfKinEmail: { type: String, required: true },
    searchText: { type: String, required: true },
    identification: {
      type: [
        { _id: String, identificationType: String, identificationValue: String, issueDate: Date, expiryDate: Date }
      ]
    },
    studentQualification: {
      type: [
        {
          _id: String,
          qualificationName: String,
          schoolName: String,
          grade: String,
          startDate: String,
          endDate: String
        }
      ]
    }
  },
  { timestamps: true }
);

studentSchema.index({ organisationId: 1, studentCustomId: 1 }, { unique: true });
studentSchema.index({ studentGender: 1 });
studentSchema.index({ searchText: 1 });

export const Student = model("Student", studentSchema);
