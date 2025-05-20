const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");

const app = express();

// Connect to MongoDB
mongoose.connect("mongodb://20.0.153.128:10999/KieranDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("MongoDB Connected to KieranDB"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.set("view engine", "ejs");

// Patient Schema
const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  gender: { type: String, enum: ['male', 'female', 'other'], required: true },
  admissionDate: { type: Date, default: Date.now },
  allergies: { type: [String], default: [] },
  medicalConditions: { type: [String], default: [] },
});

const Patient = mongoose.model("Patient", PatientSchema);

// Routes

// Redirect root to /patients
app.get("/", (req, res) => {
  res.redirect("/patients");
});

// List all patients
app.get("/patients", async (req, res) => {
  try {
    const patients = await Patient.find();
    res.render("patients", { patients });
  } catch (error) {
    res.status(500).send("Error fetching patients");
  }
});

// Show form to create new patient
app.get("/patient/new", (req, res) => {
  res.render("new_patient");
});

// Create a new patient
app.post("/patient", async (req, res) => {
  try {
    const newPatient = new Patient({
      name: req.body.name,
      age: req.body.age,
      gender: req.body.gender,
      allergies: req.body.allergies ? req.body.allergies.split(',').map(a => a.trim()) : [],
      medicalConditions: req.body.medicalConditions ? req.body.medicalConditions.split(',').map(c => c.trim()) : [],
    });
    await newPatient.save();
    res.redirect("/patients");
  } catch (error) {
    res.status(500).send("Error adding patient");
  }
});

// Show single patient details
app.get("/patient/:id", async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).send("Patient Not Found");
    res.render("patient", { patient });
  } catch (error) {
    res.status(500).send("Error fetching patient");
  }
});

// Show form to edit patient
app.get("/patient/:id/edit", async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).send("Patient Not Found");
    res.render("edit_patient", { patient });
  } catch (error) {
    res.status(500).send("Error fetching patient");
  }
});

// Update patient
app.put("/patient/:id", async (req, res) => {
  try {
    const updatedData = {
      name: req.body.name,
      age: req.body.age,
      gender: req.body.gender,
      allergies: req.body.allergies ? req.body.allergies.split(',').map(a => a.trim()) : [],
      medicalConditions: req.body.medicalConditions ? req.body.medicalConditions.split(',').map(c => c.trim()) : [],
    };
    const patient = await Patient.findByIdAndUpdate(req.params.id, updatedData, { new: true });
    if (!patient) return res.status(404).send("Patient Not Found");
    res.redirect("/patients");
  } catch (error) {
    res.status(500).send("Error updating patient");
  }
});

// Delete patient
app.delete("/patient/:id", async (req, res) => {
  try {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) return res.status(404).send("Patient Not Found");
    res.redirect("/patients");
  } catch (error) {
    res.status(500).send("Error deleting patient");
  }
});

// Start server
app.listen(10049, '0.0.0.0', () => {
  console.log("Server is running on port 10049");
});
