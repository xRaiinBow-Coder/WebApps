const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// Room Schema
const RoomSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  type: { type: String, enum: ['general', 'isolation'], default: 'general' },
  capacity: { type: Number, required: true },
  occupants: [{ type: mongoose.Schema.Types.ObjectId, ref: "Patient" }],
});

const Room = mongoose.model("Room", RoomSchema);

// Export Room model and router
module.exports = {
  Room,
  router,
};

// Routes for rooms

// Show form to create a new room
router.get("/room/new", (req, res) => {
  res.render("new_room"); // Make sure you have views/new_room.ejs
});

// Create a new room
router.post("/room", async (req, res) => {
  try {
    const { number, type, capacity } = req.body;
    const room = new Room({
      number,
      type,
      capacity: parseInt(capacity, 10),
      occupants: [],
    });
    await room.save();
    res.redirect("/rooms");
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).send("Error creating room");
  }
});

// List all rooms with occupants populated
router.get("/rooms", async (req, res) => {
  try {
    const rooms = await Room.find().populate("occupants");
    res.render("rooms", { rooms }); // Make sure views/rooms.ejs exists
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).send("Error fetching rooms");
  }
});

// Assign a patient to a room
router.post("/assign-room/:patientId", async (req, res) => {
  try {
    const { roomId } = req.body;
    const { patientId } = req.params;

    const room = await Room.findById(roomId).populate("occupants");
    if (!room) return res.status(404).send("Room not found");

    // Check if room is full
    if (room.occupants.length >= room.capacity) {
      return res.status(400).send("Room is full");
    }

    // Remove patient from any existing rooms
    await Room.updateMany(
      { occupants: patientId },
      { $pull: { occupants: patientId } }
    );

    // Add patient to new room occupants
    room.occupants.push(patientId);
    await room.save();

    res.redirect(`/patient/${patientId}`);
  } catch (error) {
    console.error("Error assigning room:", error);
    res.status(500).send("Error assigning room");
  }
});
