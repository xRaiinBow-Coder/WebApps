const request = require("supertest");
const mongoose = require("mongoose");
const { app, server } = require("./index");
const Patient = mongoose.model("Patient");
const Room = mongoose.model("Room");
const Account = mongoose.model("Account");

let agent;

beforeAll(async () => {
  await mongoose.connect("mongodb://20.0.153.128:10999/KieranDB");
  await Account.deleteMany({}); // clear accounts for clean test environment

  agent = request.agent(app);

  // Login as admin once; expect 200 or 302 based on your app behavior
  await agent
    .post("/login")
    .type("form")
    .send({ username: "admin", password: "password123" })
    .expect(200); // change to .expect(302) if login redirects
});

afterEach(async () => {
  await Patient.deleteMany({});
  await Room.deleteMany({});
  await Account.deleteMany({}); // optional, keep DB clean if needed
});

afterAll(async () => {
  await mongoose.connection.close();
  await new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
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
    });

    const res = await agent
      .post("/patient")
      .type("form")
      .send({
        name: "Test Patient",
        age: 30,
        gender: "male",
        allergies: "pollen, nuts",
        medicalConditions: "asthma",
        roomId: room._id.toString(),
      })
      .expect(302);

    const patient = await Patient.findOne({ name: "Test Patient" });
    expect(patient).toBeTruthy();

    const updatedRoom = await Room.findById(room._id);
    expect(updatedRoom.occupants.length).toBe(1);
  });

  it("should assign isolation patient to quarantine", async () => {
    const res = await agent
      .post("/patient")
      .type("form")
      .send({
        name: "Isolated Joe",
        age: 40,
        gender: "male",
        covid: "on",
      })
      .expect(302);

    const patient = await Patient.findOne({ name: "Isolated Joe" });
    expect(patient).toBeTruthy();

    const room = await Room.findOne({ occupants: patient._id });
    expect(room).toBeTruthy();
    expect(room.type).toBe("isolation");
  });

  it("should fetch a single patient page", async () => {
    const patient = await Patient.create({
      name: "Lookup",
      age: 33,
      gender: "female",
    });

    const res = await agent.get(`/patient/${patient._id}`).expect(200);
    expect(res.text).toContain("Lookup");
  });

  it("should delete a patient", async () => {
    const patient = await Patient.create({
      name: "Deletable",
      age: 25,
      gender: "male",
    });

    const res = await agent
      .delete(`/patient/${patient._id}?_method=DELETE`)
      .type("form")
      .expect(302);

    const found = await Patient.findById(patient._id);
    expect(found).toBeNull();
  });
});
