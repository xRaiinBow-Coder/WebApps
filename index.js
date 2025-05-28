const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");
const bcrypt = require("bcrypt");
const session = require("express-session");
const MongoStore = require("connect-mongo");

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
  },
   test: { type: Boolean, default: false },
});
const Patient = mongoose.model("Patient", PatientSchema);

const RoomSchema = new mongoose.Schema({
  number: { type: String, required: true },
  type: { type: String, required: true },
  capacity: { type: Number, required: true },
  occupants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }],
  test: { type: Boolean, default: false },
});
const Room = mongoose.model("Room", RoomSchema);

const AccountSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' }
});
const Account = mongoose.model("Account", AccountSchema);


(async () => {
  const adminExists = await Account.findOne({ username: 'admin' });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const adminAccount = new Account({
      username: 'admin',
      password: hashedPassword,
      role: 'admin'
    });
    await adminAccount.save();
    console.log("Default admin created: admin / password123");
  }
})();



app.use(session({
  secret: 'myKey1999', 
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: "mongodb://20.0.153.128:10999/KieranDB",
    ttl: 24 * 60 * 60,
  })
}));


function isAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  res.redirect("/login");
}

function isAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  return res.status(403).send("Access denied: Admins only");
}


app.get("/", (req, res) => res.redirect("/login"));

app.get("/register", (req, res) => res.render("register"));

app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send("Username and password are required.");
    const existingUser = await Account.findOne({ username });
    if (existingUser) return res.status(409).send("Username already taken.");
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAccount = new Account({ username, password: hashedPassword });
    await newAccount.save();
    res.redirect("/login");
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send("Error registering user.");
  }
});

app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await Account.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render("login", { error: "Invalid username or password" });
    }
    req.session.userId = user._id;
    req.session.username = user.username;  
    req.session.role = user.role;
    res.redirect("/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", { error: "Server error. Try again later." });
  }
});


app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Error logging out");
    }
    res.redirect("/login");
  });
});


app.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const rooms = await Room.find().populate("occupants");
    res.render("dashboard", {
      rooms,
      session: req.session,
      active: 'dashboard' 
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).send("Error loading dashboard");
  }
});



app.get("/patients", isAuthenticated, async (req, res) => {
  try {
    const patients = await Patient.find();
    res.render("patients", { patients, session: req.session });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching patients");
  }
});

app.get("/patient/new", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const rooms = await Room.find().populate("occupants");
    res.render("new_patient", { rooms });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading patient form");
  }
});

app.post("/patient", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const medicalConditions = req.body.medicalConditions?.split(',').map(c => c.trim()) || [];
    const allergies = req.body.allergies?.split(',').map(a => a.trim()) || [];
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
      test: req.body.test === 'true' || req.body.test === true,
    });
    await newPatient.save();

    let assignedRoom = null;

    if (requiresIsolation) {
      if (req.body.roomId && req.body.roomId !== "waiting-room" && req.body.roomId !== "none") {
        const selectedRoom = await Room.findById(req.body.roomId).populate("occupants");
        if (selectedRoom && selectedRoom.type === 'isolation' && selectedRoom.occupants.length < selectedRoom.capacity) {
          assignedRoom = selectedRoom;
        }
      }
      if (!assignedRoom) {
        assignedRoom = await Room.findOne({ number: "Quarantine", type: "isolation" }) || new Room({
          number: "Quarantine",
          type: "isolation",
          capacity: 1000,
          occupants: [],
        });
        await assignedRoom.save();
      }
    } else {
      if (req.body.roomId && req.body.roomId !== "waiting-room" && req.body.roomId !== "none") {
        const selectedRoom = await Room.findById(req.body.roomId).populate("occupants");
        if (selectedRoom && selectedRoom.type !== 'isolation' && selectedRoom.occupants.length < selectedRoom.capacity) {
          assignedRoom = selectedRoom;
        }
      }
      if (!assignedRoom) {
        assignedRoom = await Room.findOne({ number: "Waiting Room", type: "waiting" }) || new Room({
          number: "Waiting Room",
          type: "waiting",
          capacity: 1000,
          occupants: [],
        });
        await assignedRoom.save();
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

app.get("/patient/:id", isAuthenticated, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).send("Patient Not Found");
    const room = await Room.findOne({ occupants: patient._id });
    const rooms = await Room.find().populate("occupants");
    res.render("patient", { patient, room, rooms, session: req.session });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching patient");
  }
});

app.post("/patient/:id/assign-room", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const patientId = req.params.id;
    const newRoomId = req.body.roomId;
    if (!newRoomId) return res.status(400).send("Room ID is required");

    await Room.updateMany({ occupants: patientId }, { $pull: { occupants: patientId } });
    const newRoom = await Room.findById(newRoomId).populate("occupants");
    if (!newRoom) return res.status(404).send("Room not found");
    if (newRoom.occupants.length >= newRoom.capacity) return res.status(400).send("Room is full");

    newRoom.occupants.push(patientId);
    await newRoom.save();

    res.redirect(`/patient/${patientId}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error assigning room");
  }
});

app.get("/patient/:id/edit", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).send("Patient Not Found");
    res.render("edit_patient", { patient });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching patient");
  }
});

app.put("/patient/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const updatedData = {
      name: req.body.name,
      age: req.body.age,
      gender: req.body.gender,
      allergies: req.body.allergies?.split(',').map(a => a.trim()) || [],
      medicalConditions: req.body.medicalConditions?.split(',').map(c => c.trim()) || [],
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

app.delete("/patient/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) return res.status(404).send("Patient Not Found");
    await Room.updateMany({ occupants: patient._id }, { $pull: { occupants: patient._id } });
    res.redirect("/patients");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error deleting patient");
  }
});


app.get("/rooms", isAuthenticated, async (req, res) => {
  try {
    const rooms = await Room.find().populate("occupants");
    res.render("rooms", { rooms, session: req.session });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching rooms");
  }
});

app.get("/room/new", isAuthenticated, isAdmin, (req, res) => {
  res.render("new_room");
});

app.post("/room", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { number, type, capacity } = req.body;
    if (!number || !type || !capacity) return res.status(400).send("All fields required");
    const newRoom = new Room({ number, type, capacity, occupants: [] });
    await newRoom.save();
    res.redirect("/rooms");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error adding room");
  }
});

app.get("/room/:id/edit", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).send("Room Not Found");
    res.render("edit_room", { room });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching room");
  }
});

app.put("/room/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const updatedData = {
      number: req.body.number,
      type: req.body.type,
      capacity: req.body.capacity,
    };
    const room = await Room.findByIdAndUpdate(req.params.id, updatedData, { new: true });
    if (!room) return res.status(404).send("Room Not Found");
    res.redirect("/rooms");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error updating room");
  }
});

app.delete("/room/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    await Room.findByIdAndDelete(req.params.id);
    res.redirect("/rooms");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error deleting room");
  }
});

const server = app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});

module.exports = { app, server };

//finished