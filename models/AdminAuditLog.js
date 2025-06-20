const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema({
  adminUserId: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },
  adminEmail: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'login',
      'logout',
      'view_dashboard',
      'view_user_data',
      'edit_user_data',
      'delete_user',
      'suspend_user',
      'activate_user',
      'view_card_data',
      'edit_card_data',
      'delete_card',
      'view_space_data',
      'edit_space_data',
      'delete_space',
      'view_ai_chats',
      'export_data',
      'database_query',
      'system_config_change',
      'bulk_operation',
      'api_key_change',
      'security_setting_change'
    ]
  },
  targetType: {
    type: String,
    enum: ['user', 'card', 'space', 'ai_chat', 'system', 'database'],
    default: null
  },
  targetId: {
    type: String,
    default: null
  },
  targetDetails: {
    type: Object,
    default: null
  },
  oldValue: {
    type: Object,
    default: null
  },
  newValue: {
    type: Object,
    default: null
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: null
  },
  sessionId: {
    type: String,
    default: null
  },
  success: {
    type: Boolean,
    default: true
  },
  errorMessage: {
    type: String,
    default: null
  },
  metadata: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.__v;
      return ret;
    } 
  }
});

// Create indexes for performance
adminAuditLogSchema.index({ adminUserId: 1, createdAt: -1 });
adminAuditLogSchema.index({ action: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetType: 1, targetId: 1 });
adminAuditLogSchema.index({ createdAt: -1 });

// TTL index to automatically delete old logs after 2 years
adminAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });

const AdminAuditLog = mongoose.model('AdminAuditLog', adminAuditLogSchema);

module.exports = AdminAuditLog; 