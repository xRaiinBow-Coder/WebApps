const express = require("express");
const router = express.Router();
const Room = require("../models/Room");

// Show form to create a new room
router.get("/room/new", (req, res) => {
  res.render("new_room"); // views/new_room.ejs
});

// Create a new room
router.post("/room", async (req, res) => {
  try {
    const { number, type, capacity } = req.body;
    const capacityNum = parseInt(capacity, 10);

    if (isNaN(capacityNum) || capacityNum < 1) {
      return res.status(400).send("Capacity must be a positive integer");
    }

    const room = new Room({
      number,
      type,
      capacity: capacityNum,
      occupants: [],
    });

    await room.save();
    res.redirect("/rooms");
  } catch (error) {
    console.error("Error creating room:", error);
    if (error.code === 11000) {
      return res.status(400).send("Room number must be unique.");
    }
    res.status(500).send("Error creating room");
  }
});

// List all rooms
router.get("/rooms", async (req, res) => {
  try {
    const rooms = await Room.find().populate("occupants");
    res.render("rooms", { rooms });
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

    if (!roomId) {
      return res.status(400).send("Room ID is required");
    }

    const room = await Room.findById(roomId).populate("occupants");
    if (!room) return res.status(404).send("Room not found");

    if (room.occupants.length >= room.capacity) {
      return res.status(400).send("Room is full");
    }

    // Remove patient from all rooms
    await Room.updateMany(
      { occupants: patientId },
      { $pull: { occupants: patientId } }
    );

    room.occupants.push(patientId);
    await room.save();

    res.redirect(`/patient/${patientId}`);
  } catch (error) {
    console.error("Error assigning room:", error);
    res.status(500).send("Error assigning room");
  }
});

module.exports = router;
