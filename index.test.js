const request = require("supertest");
const mongoose = require("mongoose");
const app = require("./index"); // adjust if your app is exported elsewhere

const testUser = {
  username: "testuser",
  password: "TestPassword123",
};

beforeAll(async () => {
  await mongoose.connect("mongodb://localhost:27017/testdb", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe("Authentication", () => {
  test("Should register a new user", async () => {
    const res = await request(app).post("/register").send(testUser);
    expect(res.statusCode).toBe(302); // redirect to /login
  });

  test("Should not register with duplicate username", async () => {
    const res = await request(app).post("/register").send(testUser);
    expect(res.statusCode).toBe(409);
  });

  test("Should log in a user", async () => {
    const res = await request(app).post("/login").send(testUser);
    expect(res.statusCode).toBe(302); // redirect to /dashboard
    expect(res.header["set-cookie"]).toBeDefined();
  });
});
