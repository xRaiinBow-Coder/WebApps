const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");

const app = express();

mongoose.connect("mongodb://20.0.153.128:10999/KieranDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB Connected"))
.catch(err => console.error("MongoDB Error:", err));

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
  isolation: {
    covid: { type: Boolean, default: false },
    tuberculosis: { type: Boolean, default: false },
    ebola: { type: Boolean, default: false },
  }
});

const Patient = mongoose.model("Patient", PatientSchema);

// Room Schema
const RoomSchema = new mongoose.Schema({
  number: { type: String, required: true },
  type: { type: String, required: true }, // e.g. 'general', 'isolation', 'waiting'
  capacity: { type: Number, required: true },
  occupants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }],
});

const Room = mongoose.model("Room", RoomSchema);

app.get("/", (req, res) => {
  res.redirect("/patients");
});

// List patients
app.get("/patients", async (req, res) => {
  try {
    const patients = await Patient.find();
    res.render("patients", { patients });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching patients");
  }
});

// Show new patient form
app.get("/patient/new", async (req, res) => {
  try {
    const rooms = await Room.find().populate("occupants");
    res.render("new_patient", { rooms });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading patient form");
  }
});

// Add new patient
app.post("/patient", async (req, res) => {
  try {
    const medicalConditions = req.body.medicalConditions
      ? req.body.medicalConditions.split(',').map(c => c.trim())
      : [];

    const allergies = req.body.allergies
      ? req.body.allergies.split(',').map(a => a.trim())
      : [];

    const isolation = {
      covid: req.body.covid === 'on',
      tuberculosis: req.body.tuberculosis === 'on',
      ebola: req.body.ebola === 'on',
    };

    const requiresIsolation = isolation.covid || isolation.tuberculosis || isolation.ebola;

    const newPatient = new Patient({
      name: req.body.name,
      age: req.body.age,
      gender: req.body.gender,
      allergies,
      medicalConditions,
      isolation,
    });

    await newPatient.save();

    let assignedRoom = null;

    if (requiresIsolation) {
      // Ignore non-isolation rooms if patient requires isolation
      // Assign to isolation room if selected and available
      if (req.body.roomId && req.body.roomId !== "waiting-room" && req.body.roomId !== "none") {
        const selectedRoom = await Room.findById(req.body.roomId).populate("occupants");
        if (
          selectedRoom &&
          selectedRoom.type === 'isolation' &&
          selectedRoom.occupants.length < selectedRoom.capacity
        ) {
          assignedRoom = selectedRoom;
        }
      }

      // If no valid isolation room selected, assign to quarantine isolation room
      if (!assignedRoom) {
        assignedRoom = await Room.findOne({ number: "Quarantine", type: "isolation" });
        if (!assignedRoom) {
          assignedRoom = new Room({
            number: "Quarantine",
            type: "isolation",
            capacity: 1000,
            occupants: [],
          });
          await assignedRoom.save();
        }
      }
    } else {
      // Patient does NOT require isolation
      // Assign to selected room only if it is NOT isolation type
      if (req.body.roomId && req.body.roomId !== "waiting-room" && req.body.roomId !== "none") {
        const selectedRoom = await Room.findById(req.body.roomId).populate("occupants");
        if (
          selectedRoom &&
          selectedRoom.type !== 'isolation' &&
          selectedRoom.occupants.length < selectedRoom.capacity
        ) {
          assignedRoom = selectedRoom;
        }
      }

      // Otherwise, assign to waiting room
      if (!assignedRoom) {
        assignedRoom = await Room.findOne({ number: "Waiting Room", type: "waiting" });
        if (!assignedRoom) {
          assignedRoom = new Room({
            number: "Waiting Room",
            type: "waiting",
            capacity: 1000,
            occupants: [],
          });
          await assignedRoom.save();
        }
      }
    }

    assignedRoom.occupants.push(newPatient._id);
    await assignedRoom.save();

    res.redirect("/patients");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error adding patient");
  }
});



// Show patient detail with room info and rooms for reassignment
app.get("/patient/:id", async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).send("Patient Not Found");

    const room = await Room.findOne({ occupants: patient._id });
    const rooms = await Room.find().populate("occupants");

    res.render("patient", { patient, room, rooms });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching patient");
  }
});

// Assign room to patient (reassignment)
app.post("/patient/:id/assign-room", async (req, res) => {
  try {
    const patientId = req.params.id;
    const newRoomId = req.body.roomId;

    if (!newRoomId) {
      return res.status(400).send("Room ID is required");
    }

    // Remove patient from current rooms
    await Room.updateMany(
      { occupants: patientId },
      { $pull: { occupants: patientId } }
    );

    // Add patient to new room if capacity allows
    const newRoom = await Room.findById(newRoomId).populate("occupants");
    if (!newRoom) return res.status(404).send("Room not found");

    if (newRoom.occupants.length >= newRoom.capacity) {
      return res.status(400).send("Room is full");
    }

    newRoom.occupants.push(patientId);
    await newRoom.save();

    res.redirect(`/patient/${patientId}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error assigning room");
  }
});

// Edit patient form
app.get("/patient/:id/edit", async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).send("Patient Not Found");
    res.render("edit_patient", { patient });
  } catch (error) {
    console.error(error);
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
      isolation: {
        covid: req.body.covid === 'on',
        tuberculosis: req.body.tuberculosis === 'on',
        ebola: req.body.ebola === 'on',
      }
    };

    const patient = await Patient.findByIdAndUpdate(req.params.id, updatedData, { new: true });
    if (!patient) return res.status(404).send("Patient Not Found");

    res.redirect("/patients");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error updating patient");
  }
});

// Delete patient
app.delete("/patient/:id", async (req, res) => {
  try {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) return res.status(404).send("Patient Not Found");

    await Room.updateMany(
      { occupants: patient._id },
      { $pull: { occupants: patient._id } }
    );

    res.redirect("/patients");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error deleting patient");
  }
});

// List rooms
app.get("/rooms", async (req, res) => {
  try {
    const rooms = await Room.find().populate("occupants");
    res.render("rooms", { rooms });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching rooms");
  }
});

// Show new room form
app.get("/room/new", (req, res) => {
  res.render("new_room");
});

// Create new room
app.post("/room", async (req, res) => {
  try {
    const { number, type, capacity } = req.body;

    const capacityNum = parseInt(capacity, 10);
    if (isNaN(capacityNum) || capacityNum < 1) {
      return res.status(400).send("Capacity must be a positive integer");
    }

    const newRoom = new Room({
      number,
      type,
      capacity: capacityNum,
      occupants: [],
    });

    await newRoom.save();
    res.redirect("/rooms");
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(400).send("Room number must be unique.");
    }
    res.status(500).send("Error creating room");
  }
});

app.listen(10049, "0.0.0.0", () => {
  console.log("Server running on port 10049");
});
