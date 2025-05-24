const request = require("supertest");
const mongoose = require("mongoose");
const { app, server } = require("./index");
const Patient = mongoose.model("Patient");
const Room = mongoose.model("Room");
const Account = mongoose.model("Account");

let agent;
let adminCookie;

beforeAll(async () => {
  await mongoose.connect("mongodb://20.0.153.128:10999/KieranDB");

  await Account.deleteMany({ test: true });

  agent = request.agent(app);

  const loginRes = await agent
    .post("/login")
    .type("form")
    .send({ username: "admin", password: "password123" })
    .expect(302);

  const rawCookies = loginRes.headers["set-cookie"];
  if (!rawCookies) {
    throw new Error("Admin login failed: no cookie returned");
  }
  // Extract only key=value parts from each cookie string
  adminCookie = rawCookies.map(c => c.split(';')[0]).join('; ');

  console.log("Admin Cookie:", adminCookie);
});


afterEach(async () => {
  // Clean up test patients and rooms after each test
  await Patient.deleteMany({ test: true });
  await Room.deleteMany({ test: true });
});

afterAll(async () => {
  // Clean up test accounts and close connections
  await Account.deleteMany({ test: true });
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
      test: true,
    });

    const res = await agent
      .post("/patient")
      .set("Cookie", adminCookie)
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

    expect(res.status).toBe(302); // Redirect after successful post

    const patient = await Patient.findOne({ name: "Test Patient" });
    expect(patient).toBeTruthy();

    const updatedRoom = await Room.findById(room._id);
    expect(updatedRoom.occupants.length).toBe(1);
  });

  it("should assign isolation patient to quarantine", async () => {
    const res = await agent
      .post("/patient")
      .set("Cookie", adminCookie)
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
      test: true,
    });

    const res = await agent
      .get(`/patient/${patient._id}`)
      .set("Cookie", adminCookie);

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

    const res = await agent
      .delete(`/patient/${patient._id}?_method=DELETE`)
      .set("Cookie", adminCookie)
      .type("form");

    expect(res.status).toBe(302);

    const found = await Patient.findById(patient._id);
    expect(found).toBeNull();
  });
});
