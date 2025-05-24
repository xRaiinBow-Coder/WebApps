const request = require("supertest");
const mongoose = require("mongoose");
const { app, server } = require("./index");
const Patient = mongoose.model("Patient");
const Room = mongoose.model("Room");
const Account = mongoose.model("Account");

beforeAll(async () => {
  await mongoose.connect("mongodb://20.0.153.128:10999/KieranDB");
  await Account.deleteMany({ test: true });
});

afterEach(async () => {
  await Patient.deleteMany({ test: true });
  await Room.deleteMany({ test: true });
});

afterAll(async () => {
  await Account.deleteMany({ test: true });
  await mongoose.connection.close();
  server.close();
});

describe("Patient System Tests", () => {
  it("should render the login page", async () => {
    const res = await request(app).get("/login");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Login");
  });

  it("should create a new patient and assign to a room", async () => {
    const room = await Room.create({
      number: "101",
      type: "general",
      capacity: 2,
      occupants: [],
      test: true,
    });

    const res = await request(app)
      .post("/patient")
      .type("form")
      .send({
        name: "Test Patient",
        age: 30,
        gender: "male",
        allergies: "pollen, nuts",
        medicalConditions: "asthma",
        roomId: room._id.toString(),
        test: true,
      });

    // Adjust expected status depending if auth is required
    expect(res.status).toBe(200); // or 302 if it redirects unauthenticated users

    // Only check DB if the test can create patient without login
    const patient = await Patient.findOne({ name: "Test Patient" });
    expect(patient).toBeTruthy();

    const updatedRoom = await Room.findById(room._id);
    expect(updatedRoom.occupants.length).toBe(1);
  });

  it("should assign isolation patient to quarantine", async () => {
    const res = await request(app)
      .post("/patient")
      .type("form")
      .send({
        name: "Isolated Joe",
        age: 40,
        gender: "male",
        covid: "on",
        allergies: "",
        medicalConditions: "",
        test: true,
      });

    expect(res.status).toBe(200); // or 302 based on your app

    const patient = await Patient.findOne({ name: "Isolated Joe" });
    const room = await Room.findOne({ occupants: patient._id });
    expect(room.type).toBe("isolation");
  });

  it("should fetch a single patient page", async () => {
    const patient = await Patient.create({
      name: "Lookup",
      age: 33,
      gender: "female",
      test: true,
    });

    const res = await request(app).get(`/patient/${patient._id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Lookup");
  });

  it("should delete a patient", async () => {
    const patient = await Patient.create({
      name: "Deletable",
      age: 25,
      gender: "male",
      test: true,
    });

    const res = await request(app)
      .delete(`/patient/${patient._id}?_method=DELETE`)
      .type("form");

    expect(res.status).toBe(200); // or 302 if redirecting unauthenticated users

    const found = await Patient.findById(patient._id);
    expect(found).toBeNull();
  });
});
