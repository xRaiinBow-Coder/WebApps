const request = require("supertest");
const mongoose = require("mongoose");
const app = require("./index"); // Ensure app is exported from your main file
const Account = mongoose.model("Account");

beforeAll(async () => {
  await mongoose.connect("mongodb://20.0.153.128:10999/KieranDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("Authentication", () => {
  const testUser = {
    username: "testuser_" + Date.now(),
    password: "testpass123",
  };

  it("should register a new user", async () => {
    const res = await request(app)
      .post("/register")
      .send(testUser);

    expect(res.statusCode).toBe(302); // should redirect
    expect(res.headers.location).toBe("/login");

    const user = await Account.findOne({ username: testUser.username });
    expect(user).not.toBeNull();
  });

});

describe("Patients", () => {
  const agent = request.agent(app);
  let userId;

  beforeAll(async () => {
    await agent
      .post("/login")
      .send({ username: "testuser", password: "testpass123" });

    const user = await Account.findOne({ username: "testuser" });
    userId = user?._id;
  });

  it("should return the patients list (requires login)", async () => {
    const res = await agent.get("/patients");
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/patients/i);
  });
});
