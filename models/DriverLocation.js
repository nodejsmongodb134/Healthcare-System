// models/DriverLocation.js
const mongoose = require('mongoose');

const DriverLocationSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
    index: true
  },
  driverName: {
    type: String,
    required: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  accuracy: {
    type: Number,
    default: null
  },
  speed: {
    type: Number,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: { expires: '5m' }
  }
});

module.exports = mongoose.model('DriverLocation', DriverLocationSchema);