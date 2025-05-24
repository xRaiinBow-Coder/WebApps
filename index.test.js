const request = require("supertest");
const mongoose = require("mongoose");
const { app, server } = require("./index");
const Patient = mongoose.model("Patient");
const Room = mongoose.model("Room");
const Account = mongoose.model("Account");

let agent;

beforeAll(async () => {
  await mongoose.connect("mongodb://20.0.153.128:10999/KieranDB");
  await Account.deleteMany({}); // Clear test accounts or all if safe

  agent = request.agent(app); // Use agent for session persistence

  // Login as admin once, store session in agent automatically
  await agent
    .post("/login")
    .type("form")
    .send({ username: "admin", password: "password123" })
    .expect(302);
});

afterEach(async () => {
  await Patient.deleteMany({});
  await Room.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.close();
  await new Promise((resolve) => server.close(resolve));
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
      });

    expect(res.status).toBe(302);

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
      });

    expect(res.status).toBe(302);

    const patient = await Patient.findOne({ name: "Isolated Joe" });
    const room = await Room.findOne({ occupants: patient._id });
    expect(room.type).toBe("isolation");
  });

  it("should fetch a single patient page", async () => {
    const patient = await Patient.create({
      name: "Lookup",
      age: 33,
      gender: "female",
    });

    const res = await agent.get(`/patient/${patient._id}`);
    expect(res.status).toBe(200);
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
      .type("form");

    expect(res.status).toBe(302);

    const found = await Patient.findById(patient._id);
    expect(found).toBeNull();
  });
});
