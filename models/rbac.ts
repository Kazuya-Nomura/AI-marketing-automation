export enum Role {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer'
}

export enum Permission {
  // User management
  USER_CREATE = 'user:create',
  USER_READ = 'user:read',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  
  // Integration management
  INTEGRATION_CREATE = 'integration:create',
  INTEGRATION_READ = 'integration:read',
  INTEGRATION_UPDATE = 'integration:update',
  INTEGRATION_DELETE = 'integration:delete',
  INTEGRATION_TEST = 'integration:test',
  
  // Campaign management
  CAMPAIGN_CREATE = 'campaign:create',
  CAMPAIGN_READ = 'campaign:read',
  CAMPAIGN_UPDATE = 'campaign:update',
  CAMPAIGN_DELETE = 'campaign:delete',
  CAMPAIGN_LAUNCH = 'campaign:launch',
  
  // Lead management
  LEAD_CREATE = 'lead:create',
  LEAD_READ = 'lead:read',
  LEAD_UPDATE = 'lead:update',
  LEAD_DELETE = 'lead:delete',
  LEAD_EXPORT = 'lead:export',
  
  // Analytics
  ANALYTICS_READ = 'analytics:read',
  ANALYTICS_EXPORT = 'analytics:export',
  
  // Audit logs
  AUDIT_READ = 'audit:read'
}

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  [Role.ADMIN]: [
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.INTEGRATION_CREATE,
    Permission.INTEGRATION_READ,
    Permission.INTEGRATION_UPDATE,
    Permission.INTEGRATION_TEST,
    Permission.CAMPAIGN_CREATE,
    Permission.CAMPAIGN_READ,
    Permission.CAMPAIGN_UPDATE,
    Permission.CAMPAIGN_LAUNCH,
    Permission.LEAD_CREATE,
    Permission.LEAD_READ,
    Permission.LEAD_UPDATE,
    Permission.LEAD_EXPORT,
    Permission.ANALYTICS_READ,
    Permission.ANALYTICS_EXPORT,
    Permission.AUDIT_READ
  ],
  [Role.USER]: [
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.INTEGRATION_CREATE,
    Permission.INTEGRATION_READ,
    Permission.INTEGRATION_UPDATE,
    Permission.INTEGRATION_TEST,
    Permission.CAMPAIGN_CREATE,
    Permission.CAMPAIGN_READ,
    Permission.CAMPAIGN_UPDATE,
    Permission.CAMPAIGN_LAUNCH,
    Permission.LEAD_CREATE,
    Permission.LEAD_READ,
    Permission.LEAD_UPDATE,
    Permission.ANALYTICS_READ
  ],
  [Role.VIEWER]: [
    Permission.USER_READ,
    Permission.INTEGRATION_READ,
    Permission.CAMPAIGN_READ,
    Permission.LEAD_READ,
    Permission.ANALYTICS_READ
  ]
};

// Middleware for permission checking
export const requirePermission = (permission: Permission) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const userPermissions = rolePermissions[user.role];
    
    if (!userPermissions.includes(permission)) {
      await auditLog({
        userId: user.id,
        action: 'permission_denied',
        resource: permission,
        timestamp: new Date()
      });
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permission
      });
    }
    
    next();
  };
};