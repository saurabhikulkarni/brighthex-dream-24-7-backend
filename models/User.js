const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  fullname: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    default: ''
  },
  mobile: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  auth_key: {
    type: String,
    default: ''
  },
  app_key: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    default: 'activated',
    enum: ['activated', 'blocked', 'pending']
  },
  image: {
    type: String,
    default: ''
  },
  deviceId: {
    type: String,
    default: ''
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true,
  versionKey: false
});

// Index for faster queries
userSchema.index({ mobile: 1 });
userSchema.index({ auth_key: 1 });

module.exports = mongoose.model('User', userSchema);
